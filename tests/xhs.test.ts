// 小红书测试。fixtures 来自 2026-10-02 在小红书网页版上实际读到的 __INITIAL_STATE__（裁掉了用不到的字段）；
// xhs-images.json 第 3 张图的 livePhoto/stream 是手工改的，用来覆盖实况图。
import { describe, expect, it } from 'vitest';
import { buildXhsDoc, descToMarkdown, parseCount } from '../src/adapters/xhs/convert';
import { pickVariant } from '../src/media/download';
import { notePath } from '../src/render/filename';
import { renderNote } from '../src/render/markdown';
import imagesFx from './fixtures/xhs-images.json';
import videoFx from './fixtures/xhs-video.json';

type Fx = Record<string, unknown> & { __comments?: Record<string, unknown>[] };
const load = (fx: unknown) => {
  const { __comments, ...note } = fx as Fx;
  return buildXhsDoc({ note, comments: __comments })!;
};

describe('图文笔记', () => {
  const doc = load(imagesFx);
  const md = renderNote({ doc, options: {}, local: new Map() });

  it('基本信息', () => {
    expect(doc.id).toBe('6a9a48370000000012037224');
    expect(doc.url).toBe('https://www.xiaohongshu.com/explore/6a9a48370000000012037224');
    expect(doc.title).toBe('千万别直接给小孩子看！韩熙载夜宴图✨');
    expect(doc.author.name).toBe('黑豹说');
    expect(doc.published).toBe('2026-09-04T04:25:27Z');
    expect(doc.tags).toEqual(['韩熙载夜宴图', '传世名画', '古画解读']);
    expect(doc.stats).toEqual({ likes: 467, collects: 99, replies: 81, reposts: 36 });
    expect(doc.extra?.ip_location).toBe('浙江');
  });

  it('图片换成 https，实况图附带短视频', () => {
    expect(doc.media.map((m) => m.kind)).toEqual(['image', 'image', 'image', 'video']);
    expect(doc.media.every((m) => m.url.startsWith('https://'))).toBe(true);
    expect(doc.media[3]!.alt).toBe('实况');
  });

  it('正文：分段、话题不生成 Obsidian 标签、先文字后图集', () => {
    expect(md).toContain('热闹夜宴下藏着隐晦：\n\n图1：男女恋恋不舍');
    expect(md).toContain('\\#韩熙载夜宴图 \\#传世名画 \\#古画解读');
    expect(md).not.toContain('[话题]');
    expect(md.indexOf('画卷分五段')).toBeLessThan(md.indexOf('![](https://sns-webpic'));
  });

  it('文件名用作者昵称', () => {
    expect(notePath(doc, 'AllClip')).toMatch(/^AllClip\/小红书\/2026-09-0\d 黑豹说 千万别直接给小孩子看！韩熙载夜宴图✨$/);
  });
});

describe('视频笔记', () => {
  const doc = load(videoFx);
  const v = doc.media[0]!;

  it('优先普通 mp4，封面用第一张图', () => {
    expect(doc.media).toHaveLength(1);
    expect(v.kind).toBe('video');
    expect(v.url).toBe('https://sns-video-qc.xhscdn.com/stream/79/110/259/01ea9e4160744a3101037003a07a336635_259.mp4?sign=a7cb546132b1a9aba582f1cb54eeb215&t=6ac4314e');
    expect(v.poster).toContain('1040g008324q7lnmkmu0049ltbok4sn4tasmobho');
    expect(v.durationMs).toBe(170946);
  });

  it('视频放在正文前面；“2.8万”换算成数字', () => {
    const md = renderNote({ doc, options: {}, local: new Map() });
    expect(md.indexOf('[▶ 视频]')).toBeLessThan(md.indexOf('\\#三文鱼'));
    expect(md).toContain('likes: 28000');
    expect(md).toContain('reposts: 13000');
  });

  it('评论（勾选时输出），带楼中楼', () => {
    const md = renderNote({ doc, options: { includeComments: true }, local: new Map() });
    expect(md).toContain('- **special.** · 1000 赞：好想也这样吃一顿\n  - **齐** · 10 赞：哈哈哈');
  });

  it('按精确大小挑清晰度', () => {
    expect(pickVariant(v, 200 * 1024 * 1024)).toContain('_259.mp4');
  });
});

describe('接口返回的下划线字段也能读', () => {
  it('note_card 格式', () => {
    const doc = buildXhsDoc({
      note: {
        note_id: '6a9a48370000000012037224',
        type: 'normal',
        title: '标题',
        desc: '正文',
        time: 1788495927000,
        user: { user_id: 'u1', nickname: '昵称' },
        interact_info: { liked_count: '1.2万', collected_count: '10+' },
        image_list: [{ url_default: 'http://sns-webpic-qc.xhscdn.com/a/b!x', info_list: [] }],
        tag_list: [{ name: '话题', type: 'topic' }],
      },
    })!;
    expect(doc.author.url).toBe('https://www.xiaohongshu.com/user/profile/u1');
    expect(doc.stats).toEqual({ likes: 12000, collects: 10 });
    expect(doc.media[0]!.url).toBe('https://sns-webpic-qc.xhscdn.com/a/b!x');
    expect(doc.tags).toEqual(['话题']);
  });

  it('非法笔记 ID 返回 null', () => {
    expect(buildXhsDoc({ note: { noteId: 'abc' } })).toBeNull();
  });
});

describe('工具函数', () => {
  it('parseCount', () => {
    expect(parseCount('2.8万')).toBe(28000);
    expect(parseCount('1千+')).toBe(1000);
    expect(parseCount('10+')).toBe(10);
    expect(parseCount('1w')).toBe(10000);
    expect(parseCount('1,234')).toBe(1234);
    expect(parseCount('赞')).toBeUndefined();
  });

  it('descToMarkdown：行首 # 和 > 转义，多余空行合并', () => {
    expect(descToMarkdown('# 标题\n>引用\n\t\n\n\n正文')).toBe('\\# 标题\n\\>引用\n\n正文');
  });
});
