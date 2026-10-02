// M5：文件名模板、status/默认标签、选区摘录、frontmatter 附加信息
import { describe, expect, it } from 'vitest';
import { excerptDoc } from '../src/core/pipeline';
import type { ClipDoc } from '../src/core/types';
import { notePath } from '../src/render/filename';
import { renderNote } from '../src/render/markdown';

const doc: ClipDoc = {
  platform: 'xiaohongshu',
  kind: 'note',
  id: '6a9a48370000000012037224',
  url: 'https://www.xiaohongshu.com/explore/6a9a48370000000012037224',
  title: '韩熙载夜宴图',
  author: { name: '黑豹说' },
  published: '2026-09-04T04:25:27Z',
  tags: ['古画'],
  body: '正文\n\n{{media:0}}',
  media: [{ kind: 'image', url: 'https://a.xhscdn.com/1.webp', downloadable: true }],
  comments: [{ author: 'a', text: 'b' }],
  extra: { ip_location: '浙江', hint: '不应出现', nsfw: false },
  source: 'state',
};

describe('文件名模板', () => {
  it('默认：日期 作者 标题', () => {
    expect(notePath(doc, 'AllClip')).toMatch(/^AllClip\/小红书\/2026-09-0\d 黑豹说 韩熙载夜宴图$/);
  });
  it('自定义模板，未知变量原样保留，非法字符清掉', () => {
    expect(notePath(doc, 'AllClip', undefined, '{platform}-{title}-{id}')).toBe('AllClip/小红书/小红书-韩熙载夜宴图-6a9a48370000000012037224');
    expect(notePath(doc, 'AllClip', undefined, '{title} {foo}')).toBe('AllClip/小红书/韩熙载夜宴图 {foo}');
    expect(notePath(doc, 'AllClip', undefined, '{author}/{title}')).toBe('AllClip/小红书/黑豹说 韩熙载夜宴图');
  });
  it('空模板用默认', () => {
    expect(notePath(doc, 'AllClip', undefined, '  ')).toBe(notePath(doc, 'AllClip'));
  });
});

describe('frontmatter', () => {
  const md = renderNote({ doc, options: { tags: ['我的'] }, local: new Map(), config: { status: '未读', extraTags: ['剪藏'] } });
  it('status 和默认标签', () => {
    expect(md).toContain('status: "未读"');
    expect(md).toContain('tags:\n  - "allclip/xiaohongshu"\n  - "古画"\n  - "剪藏"\n  - "我的"');
  });
  it('平台附加信息写进 frontmatter，提示文字不写', () => {
    expect(md).toContain('ip_location: "浙江"');
    expect(md).toContain('nsfw: false');
    expect(md).not.toContain('不应出现');
  });
});

describe('选区摘录', () => {
  it('独立 ID 和标题，正文只有选区，图片重新编号，不带评论', async () => {
    const ex = await excerptDoc(doc, '选中的一段话\n\n![](https://a.xhscdn.com/2.webp)');
    expect(ex.id).toMatch(/^6a9a48370000000012037224-[0-9a-f]{12}$/);
    expect(ex.title).toBe('韩熙载夜宴图（摘录）');
    expect(ex.body).toBe('选中的一段话\n\n{{media:0}}');
    expect(ex.media.map((m) => m.url)).toEqual(['https://a.xhscdn.com/2.webp']);
    expect(ex.comments).toBeUndefined();
    expect(ex.extra?.excerpt_of).toBe(doc.url);
    // 同一段选区 → 同一个 ID（再存会更新，不会重复）
    expect((await excerptDoc(doc, '选中的一段话\n\n![](https://a.xhscdn.com/2.webp)')).id).toBe(ex.id);
    // 标题不会叠加“（摘录）”
    expect((await excerptDoc(doc, 'x', '韩熙载夜宴图（摘录）')).title).toBe('韩熙载夜宴图（摘录）');
  });
});
