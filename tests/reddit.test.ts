// Reddit 测试。fixtures 是按 Reddit 公开 JSON 格式（/comments/<id>.json?raw_json=1）手写的——
// 开发环境里 Reddit 拦截了脚本请求，没能抓到真实响应。
import { describe, expect, it } from 'vitest';
import { buildRedditDoc } from '../src/adapters/reddit/convert';
import { notePath } from '../src/render/filename';
import { renderNote } from '../src/render/markdown';
import text from './fixtures/reddit-text.json';

const listing = (post: Record<string, unknown>) => [{ data: { children: [{ kind: 't3', data: { id: 'p1', title: 'T', permalink: '/r/pics/comments/p1/t/', subreddit: 'pics', author: 'x', ...post } }] } }, { data: { children: [] } }];

describe('文字帖', () => {
  const doc = buildRedditDoc(text, { topComments: 10 })!;
  const md = renderNote({ doc, options: { includeComments: true }, local: new Map() });

  it('元数据', () => {
    expect(doc.id).toBe('1abc234');
    expect(doc.url).toBe('https://www.reddit.com/r/ObsidianMD/comments/1abc234/how_i_organize_my_obsidian_vault_after_3_years/');
    expect(doc.author).toEqual({ name: 'vault_keeper', url: 'https://www.reddit.com/user/vault_keeper' });
    expect(doc.tags).toEqual(['ObsidianMD', 'Showcase']);
    expect(doc.stats).toEqual({ score: 1523, replies: 214 });
    expect(doc.published).toBe('2025-09-27T19:06:40Z');
    expect(doc.extra?.upvote_ratio).toBe(0.97);
    expect(notePath(doc, 'AllClip')).toMatch(/^AllClip\/Reddit\/2025-09-2\d vault_keeper How I organize my Obsidian vault after 3 years$/);
  });

  it('正文 Markdown 原样保留，内嵌图片（媒体 ID 和单独一行的 preview 链接）变成图片', () => {
    expect(md).toContain('1. **Inbox** for everything new');
    expect(doc.media.map((m) => m.url)).toEqual([
      'https://preview.redd.it/x9y8z7.png?width=1200&format=png&auto=webp&s=abc',
      'https://preview.redd.it/abc123def.png?width=1080&format=png&auto=webp&s=deadbeef',
    ]);
    expect(md).toContain('More details: https://example.com/post');
  });

  it('评论：按得分取前 N 条，跳过置顶/机器人/已删除，回复最多 3 层', () => {
    expect(doc.comments!.map((c) => c.author)).toEqual(['u/carol', 'u/alice', 'u/dave']);
    const alice = doc.comments![1]!;
    expect(alice.children!.map((c) => c.author)).toEqual(['u/vault_keeper', 'u/bob']);
    expect(alice.children![0]!.children![0]!.text).toBe('One more question');
    expect(alice.children![0]!.children![0]!.children).toBeUndefined(); // 第 4 层不要
    expect(md).toContain('- **u/carol** · 800 赞：I use PARA instead');
    expect(md).toContain('- **u/alice** · 300 赞：Great setup! Thanks for sharing.');
  });

  it('评论条数按设置截取', () => {
    expect(buildRedditDoc(text, { topComments: 1 })!.comments!.map((c) => c.author)).toEqual(['u/carol']);
    expect(buildRedditDoc(text, { topComments: 0 })!.comments).toBeUndefined();
  });
});

describe('其它帖子类型', () => {
  it('图集：按 gallery_data 顺序，带说明；动图用 mp4', () => {
    const doc = buildRedditDoc(
      listing({
        is_gallery: true,
        gallery_data: { items: [{ media_id: 'b', caption: '第二张' }, { media_id: 'a' }, { media_id: 'c' }] },
        media_metadata: {
          a: { status: 'valid', e: 'Image', s: { u: 'https://preview.redd.it/a.jpg?s=1', x: 10, y: 10 } },
          b: { status: 'valid', e: 'Image', s: { u: 'https://preview.redd.it/b.jpg?s=1' } },
          c: { status: 'valid', e: 'AnimatedImage', s: { gif: 'https://i.redd.it/c.gif', mp4: 'https://preview.redd.it/c.gif?format=mp4' } },
        },
      }),
      { topComments: 10 },
    )!;
    expect(doc.media.map((m) => [m.kind, m.url, m.alt])).toEqual([
      ['image', 'https://preview.redd.it/b.jpg?s=1', '第二张'],
      ['image', 'https://preview.redd.it/a.jpg?s=1', undefined],
      ['gif', 'https://preview.redd.it/c.gif?format=mp4', undefined],
    ]);
    expect(doc.body).toBe('{{media:0}}\n\n{{media:1}}\n\n{{media:2}}');
  });

  it('视频：音画分离不下载，存封面 + 原帖链接', () => {
    const doc = buildRedditDoc(
      listing({ is_video: true, media: { reddit_video: { fallback_url: 'https://v.redd.it/x/DASH_720.mp4', duration: 30 } }, preview: { images: [{ source: { url: 'https://preview.redd.it/poster.jpg' } }] } }),
      { topComments: 10 },
    )!;
    expect(doc.media[0]).toMatchObject({ kind: 'video', downloadable: false, poster: 'https://preview.redd.it/poster.jpg', url: 'https://www.reddit.com/r/pics/comments/p1/t/' });
  });

  it('单图帖', () => {
    const doc = buildRedditDoc(listing({ url: 'https://i.redd.it/cat.jpg', post_hint: 'image' }), { topComments: 10 })!;
    expect(doc.media).toEqual([{ kind: 'image', url: 'https://i.redd.it/cat.jpg', downloadable: true }]);
  });

  it('外链帖：链接 + 预览图', () => {
    const doc = buildRedditDoc(
      listing({ is_self: false, title: 'Cool article', url: 'https://blog.example.com/a', domain: 'blog.example.com', preview: { images: [{ source: { url: 'https://external-preview.redd.it/p.jpg' } }] } }),
      { topComments: 10 },
    )!;
    expect(doc.body).toContain('🔗 [Cool article](https://blog.example.com/a) — blog.example.com');
    expect(doc.media[0]!.url).toBe('https://external-preview.redd.it/p.jpg');
  });

  it('转发帖：内容取原帖，注明来源', () => {
    const doc = buildRedditDoc(
      listing({ crosspost_parent_list: [{ id: 'orig', subreddit: 'aww', subreddit_name_prefixed: 'r/aww', permalink: '/r/aww/comments/orig/x/', url: 'https://i.redd.it/dog.png', selftext: '' }] }),
      { topComments: 10 },
    )!;
    expect(doc.body).toContain('> 转发自 [r/aww](https://www.reddit.com/r/aww/comments/orig/x/)');
    expect(doc.media[0]!.url).toBe('https://i.redd.it/dog.png');
    expect(doc.id).toBe('p1'); // 去重仍按当前帖子
  });

  it('格式不对返回 null', () => {
    expect(buildRedditDoc({}, { topComments: 10 })).toBeNull();
    expect(buildRedditDoc([{ data: { children: [] } }], { topComments: 10 })).toBeNull();
  });
});
