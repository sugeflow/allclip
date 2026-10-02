import { describe, expect, it } from 'vitest';
import { canonicalUrl, liftImages } from '../src/core/media-md';
import type { ClipDoc } from '../src/core/types';
import { assetPath, notePath, safeName, titleOf } from '../src/render/filename';
import { NOTE_HEADING, mergeNote, renderNote } from '../src/render/markdown';

const base: ClipDoc = {
  platform: 'x',
  kind: 'post',
  id: '1843000000000000000',
  url: 'https://x.com/karpathy/status/1843000000000000000',
  title: '',
  author: { name: 'Andrej Karpathy', handle: '@karpathy', url: 'https://x.com/karpathy' },
  published: '2026-09-30T14:21:00Z',
  tags: ['LLM'],
  stats: { likes: 9123, reposts: 1500 },
  body: '训练大模型的一些想法：数据比架构重要。\n\n{{media:0}}',
  media: [{ kind: 'image', url: 'https://pbs.twimg.com/media/abc?format=jpg&name=orig', downloadable: true }],
  source: 'intercept',
};

describe('liftImages', () => {
  it('把图片换成占位符并去重', () => {
    const { body, media } = liftImages('a ![x](https://a.com/1.png) b ![y](https://a.com/1.png "t") ![](data:image/png;base64,xx)');
    expect(body).toBe('a {{media:0}} b {{media:0}} ![](data:image/png;base64,xx)');
    expect(media).toHaveLength(1);
    expect(media[0]!.alt).toBe('x');
  });
});

describe('canonicalUrl', () => {
  it('去掉跟踪参数和锚点', () => {
    expect(canonicalUrl('https://a.com/p?id=1&utm_source=x&xsec_token=abc#top')).toBe('https://a.com/p?id=1');
  });
});

describe('文件名', () => {
  it('清理非法字符', () => {
    expect(safeName('a/b:c*d?"e"<f>|g#h^[i]')).toBe('a b c d e f g h i');
  });
  it('没有标题时取正文前 30 字', () => {
    expect(titleOf(base)).toBe('训练大模型的一些想法：数据比架构重要。');
  });
  it('笔记路径：根目录/平台/日期 作者 标题', () => {
    expect(notePath(base, 'AllClip/')).toBe('AllClip/X/2026-09-30 @karpathy 训练大模型的一些想法：数据比架构重要。');
  });
  it('附件路径', () => {
    expect(assetPath(base, 'AllClip', 0, 'jpg')).toBe('AllClip/_assets/x/1843000000000000000-1.jpg');
  });
});

describe('renderNote', () => {
  const clipped = new Date('2026-10-02T02:05:12Z');

  it('本地图片用 ![[ ]]，frontmatter 字段齐全', () => {
    const md = renderNote({
      doc: base,
      options: { tags: ['AI 研究'], note: '值得细读' },
      local: new Map([[0, 'AllClip/_assets/x/1843000000000000000-1.jpg']]),
      clipped,
    });
    expect(md).toContain('platform: "x"');
    expect(md).toContain('source: "https://x.com/karpathy/status/1843000000000000000"');
    expect(md).toContain('  - "allclip/x"\n  - "LLM"\n  - "AI-研究"');
    expect(md).toContain('likes: 9123');
    expect(md).toContain('status: "inbox"');
    expect(md).toContain('![[AllClip/_assets/x/1843000000000000000-1.jpg]]');
    expect(md).toContain(`${NOTE_HEADING}\n\n值得细读`);
  });

  it('没下载的图片保留远程链接；引用推文渲染成 callout', () => {
    const md = renderNote({
      doc: {
        ...base,
        quoted: { ...base, id: '1', author: { name: 'B', handle: '@b' }, body: '被引用的内容', media: [], url: 'https://x.com/b/status/1' },
      },
      options: {},
      local: new Map(),
      clipped,
    });
    expect(md).toContain('![](https://pbs.twimg.com/media/abc?format=jpg&name=orig)');
    expect(md).toContain('> [!quote] 引用 @b · [原文](https://x.com/b/status/1)\n> 被引用的内容');
  });

  it('评论只在勾选时输出', () => {
    const doc = { ...base, comments: [{ author: 'u1', text: '同意', likes: 3, children: [{ author: 'u2', text: '+1' }] }] };
    expect(renderNote({ doc, options: {}, local: new Map(), clipped })).not.toContain('## 评论');
    const md = renderNote({ doc, options: { includeComments: true }, local: new Map(), clipped });
    expect(md).toContain('## 评论\n\n- **u1** · 3 赞：同意\n  - **u2**：+1');
  });
});

describe('mergeNote', () => {
  it('更新时保留旧备注，并追加新备注', () => {
    const old = `---\ntitle: a\n---\n旧正文\n\n${NOTE_HEADING}\n\n我之前写的想法\n`;
    const fresh = `---\ntitle: a\n---\n新正文\n\n${NOTE_HEADING}\n\n新想法\n`;
    const merged = mergeNote(old, fresh);
    expect(merged).toContain('新正文');
    expect(merged).not.toContain('旧正文');
    expect(merged).toContain(`${NOTE_HEADING}\n\n我之前写的想法\n\n新想法\n`);
  });
  it('旧备注为空时直接用新内容', () => {
    const old = `正文\n\n${NOTE_HEADING}\n\n`;
    expect(mergeNote(old, `新\n\n${NOTE_HEADING}\n\n`)).toBe(`新\n\n${NOTE_HEADING}\n\n`);
  });
});
