// X 适配器测试。fixtures 来自 2026-10-02 在 x.com 上实际抓到的 GraphQL 响应（裁掉了用不到的字段）；
// x-article.json 最后两个列表块和 LINK 实体是手工补的，用来覆盖列表和链接。
import { describe, expect, it } from 'vitest';
import { buildXDoc, tweetText } from '../src/adapters/x/convert';
import { collectTweets, type RawTweet } from '../src/adapters/x/raw';
import { pickVariant } from '../src/media/download';
import { notePath, titleOf, ymd } from '../src/render/filename';
import { renderNote } from '../src/render/markdown';
import article from './fixtures/x-article.json';
import thread from './fixtures/x-thread-karpathy.json';
import video from './fixtures/x-video-note.json';

const T = thread as unknown as RawTweet[];
const render = (id: string, pool: RawTweet[]) =>
  renderNote({ doc: buildXDoc(id, pool)!, options: {}, local: new Map(), clipped: new Date('2026-10-02T10:00:00Z') });

describe('线程', () => {
  it('从中间任意一条进入，都拼出同一个 4 条线程，串首作为 ID', () => {
    for (const id of ['2034321875506196585', '2034325423358955981', '2034329390377762848']) {
      const doc = buildXDoc(id, T)!;
      expect(doc.kind).toBe('thread');
      expect(doc.id).toBe('2034321875506196585');
      expect(doc.extra?.thread_length).toBe(4);
    }
  });

  it('作者回复别人的推文不算进线程', () => {
    const doc = buildXDoc('2034330376383140272', T)!;
    expect(doc.kind).toBe('post');
    expect(doc.body).toContain('Dobby runs my entire house');
    expect(doc.body).not.toContain('@shikhr_'); // 开头的 @回复对象被 display_text_range 去掉
  });

  it('长推文用 note_tweet 全文；引用推文渲染成 callout；链接卡片用标题当链接文字', () => {
    const md = render('2034325423358955981', T);
    expect(md).toContain('trained end to end). This was back when');
    expect(md).toContain('> [!quote] 引用 [NVIDIA AI Developer @NVIDIAAIDev](https://x.com/NVIDIAAIDev/status/2034291235041554871) · 2026-03-18');
    expect(md).toContain('> 🔗 [blogs.nvidia.com/blog/gtc-2026-…](https://blogs.nvidia.com/blog/gtc-2026-news/#dgx-station)');
    expect(md).toContain('[Opening Keynote at GTC 2015: Leaps in Visual Computing](https://youtu.be/xQhb3C2hQoE?si=x3qQMjG-dktoNNv_&t=1577)');
    expect(md).not.toContain('t.co/');
    // 引用里的图片和线程里的图片都取原图
    expect(md).toContain('![](https://pbs.twimg.com/media/HDq6TL-XEAAK_Ws.jpg?name=orig)');
    expect(md).toContain('![](https://pbs.twimg.com/media/HDtfHzSa0AAJkVl.jpg?name=orig)');
  });

  it('frontmatter 带作者和互动数据', () => {
    const md = render('2034321875506196585', T);
    expect(md).toContain('author_handle: "@karpathy"');
    expect(md).toContain('published: "2026-03-18T17:31:45Z"');
    expect(md).toContain('likes: 19007');
    expect(md).toContain('views: 1134067');
  });

  it('英文推文的自动标题在单词边界截断', () => {
    const doc = buildXDoc('2034321875506196585', T)!;
    expect(titleOf(doc)).toBe('Thank you Jensen and NVIDIA! She’s a real beauty! I was');
    expect(notePath(doc, 'AllClip')).toBe(`AllClip/X/${ymd(doc.published)} @karpathy Thank you Jensen and NVIDIA! She’s a real beauty! I was`);
  });
});

describe('视频', () => {
  const doc = buildXDoc('2083749667410727319', video as unknown as RawTweet[])!;
  const v = doc.media[0]!;

  it('视频带所有 mp4 清晰度、时长和封面', () => {
    expect(v.kind).toBe('video');
    expect(v.downloadable).toBe(true);
    expect(v.variants).toHaveLength(4);
    expect(v.durationMs).toBe(92633);
    expect(v.poster).toContain('amplify_video_thumb');
  });

  it('按大小上限挑清晰度：92 秒视频，200MB 选 1080p，15MB 选 360p', () => {
    expect(pickVariant(v, 200 * 1024 * 1024)).toContain('1920x1080');
    expect(pickVariant(v, 15 * 1024 * 1024)).toContain('640x360');
    expect(pickVariant(v, 1024)).toContain('480x270'); // 都超就用最低档
  });
});

describe('X Article 长文', () => {
  const doc = buildXDoc('2017963276131598428', article as RawTweet[])!;
  const md = renderNote({ doc, options: {}, local: new Map() });

  it('标题、封面、正文图片', () => {
    expect(doc.kind).toBe('article');
    expect(doc.title).toBe('从选题到发布：dontbesilent 的 Claude Code 工作流');
    expect(doc.media.map((m) => m.url)).toEqual([
      'https://pbs.twimg.com/media/HAE-KRdbMAEbdUk.jpg?name=orig',
      'https://pbs.twimg.com/media/HAE-DKmacAANmkw.jpg?name=orig',
    ]);
  });

  it('标题整行加粗时不重复加粗；列表、链接、引用', () => {
    expect(md).toContain('\n## 为什么要看这篇文章？\n');
    expect(md).toContain('**由于流程太过复杂，本人不具备撰写能力，本文由 claude code 撰写。**');
    expect(md).toContain('- 年发 13,000 条内容\n- 覆盖 **[6 ](https://example.com/platforms)**个平台');
    expect(md).toContain('> 我想搭建一套像 dontbesilent 一样的内容生产系统。');
  });
});

describe('其他', () => {
  it('collectTweets 能从任意嵌套的响应里找出推文（含引用里的）', () => {
    const found = collectTweets({ data: { a: [{ b: { tweet_results: { result: T[0] } } }] } });
    expect(found.map((t) => t.rest_id)).toEqual(['2034321875506196585', '2034291235041554871']);
  });

  it('TweetWithVisibilityResults 外壳和转发都能解开', () => {
    const inner = T[3]!;
    const wrapped: RawTweet = { __typename: 'TweetWithVisibilityResults', tweet: inner };
    const rt: RawTweet = {
      rest_id: '999',
      core: inner.core,
      legacy: { full_text: 'RT @karpathy: ...', user_id_str: '1', retweeted_status_result: { result: wrapped } },
    };
    const doc = buildXDoc('999', [rt, ...T])!;
    expect(doc.body).toContain('Ugh X breaks time links');
  });

  it('HTML 实体还原，行首 # 转义', () => {
    const t: RawTweet = { rest_id: '1', legacy: { full_text: '# 不是标题 &amp; a &lt; b', display_text_range: [0, 23] } };
    expect(tweetText(t)).toBe('\\# 不是标题 & a < b');
  });

  it('投票', () => {
    const t: RawTweet = {
      rest_id: '1',
      core: T[0]!.core,
      legacy: { full_text: '你选哪个？', user_id_str: '1', created_at: 'Wed Mar 18 17:31:45 +0000 2026' },
      card: {
        legacy: {
          name: 'poll2choice_text_only',
          binding_values: [
            { key: 'choice1_label', value: { string_value: 'A' } },
            { key: 'choice1_count', value: { string_value: '30' } },
            { key: 'choice2_label', value: { string_value: 'B' } },
            { key: 'choice2_count', value: { string_value: '10' } },
          ],
        },
      },
    };
    expect(buildXDoc('1', [t])!.body).toContain('**投票**\n- A — 30 票 · 75%\n- B — 10 票 · 25%');
  });
});
