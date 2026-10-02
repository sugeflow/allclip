// Reddit 帖子 JSON（帖子地址加 .json?raw_json=1）→ ClipDoc。纯函数。
// 返回值是两个 Listing：[帖子, 评论树]。raw_json=1 让文本不再做 HTML 转义。
import { liftImages } from '../../core/media-md';
import type { ClipDoc, CommentNode, MediaItem } from '../../core/types';

type Obj = Record<string, any>;

export interface RedditOptions {
  /** 保存得分最高的几条一级评论 */
  topComments: number;
  /** 每条评论下保留几条回复、几层 */
  repliesPerComment?: number;
  maxDepth?: number;
}

export function buildRedditDoc(listing: unknown, opts: RedditOptions): ClipDoc | null {
  if (!Array.isArray(listing)) return null;
  const post: Obj | undefined = listing[0]?.data?.children?.[0]?.data;
  if (!post?.id) return null;

  // 转发帖：内容在原帖里
  const src: Obj = post.crosspost_parent_list?.[0] || post;
  const media: MediaItem[] = [];
  const parts: string[] = [];

  if (src !== post) parts.push(`> 转发自 [${src.subreddit_name_prefixed || 'r/' + src.subreddit}](https://www.reddit.com${src.permalink})`);

  const gallery = galleryOf(src);
  const poster = previewImage(src);
  if (gallery.length) {
    media.push(...gallery);
  } else if (src.is_video || src.media?.reddit_video) {
    // Reddit 视频音画分离（DASH），单独的 mp4 没有声音，只存封面和原帖链接
    media.push({ kind: 'video', url: `https://www.reddit.com${src.permalink}`, poster, downloadable: false, durationMs: src.media?.reddit_video?.duration ? src.media.reddit_video.duration * 1000 : undefined });
  } else if (isImageUrl(src.url)) {
    media.push({ kind: src.url.endsWith('.gif') ? 'gif' : 'image', url: src.url, downloadable: true });
  }

  let text = (src.selftext || '').trim();
  if (text) {
    text = inlineMedia(text, src.media_metadata);
    const lifted = liftImages(text, media);
    parts.push(lifted.body);
  }

  // 外链帖
  if (!src.is_self && !media.length && src.url && !/reddit\.com/.test(src.url)) {
    parts.push(`🔗 [${src.title?.trim() || src.domain}](${src.url})${src.domain ? ` — ${src.domain}` : ''}`);
    if (poster) media.push({ kind: 'image', url: poster, downloadable: true });
  }
  const tokens = media.map((_, i) => `{{media:${i}}}`).filter((t) => !parts.join('\n').includes(t));
  if (tokens.length) parts.splice(src !== post ? 1 : 0, 0, tokens.join('\n\n'));

  const comments = commentsOf(listing[1], opts);
  const author = post.author && post.author !== '[deleted]' ? post.author : '';
  const tags = [post.subreddit, post.link_flair_text].filter((t) => typeof t === 'string' && t.trim()).map((t: string) => t.trim());

  return {
    platform: 'reddit',
    kind: 'post',
    id: String(post.id),
    url: `https://www.reddit.com${post.permalink}`,
    title: String(post.title || '').trim(),
    author: { name: author || '[deleted]', url: author ? `https://www.reddit.com/user/${author}` : undefined },
    published: post.created_utc ? new Date(post.created_utc * 1000).toISOString().replace('.000Z', 'Z') : undefined,
    tags,
    stats: { score: num(post.score), replies: num(post.num_comments) },
    body: parts.filter(Boolean).join('\n\n'),
    media,
    comments: comments.length ? comments : undefined,
    site: post.subreddit_name_prefixed || undefined,
    extra: {
      ...(post.upvote_ratio != null ? { upvote_ratio: post.upvote_ratio } : {}),
      ...(post.over_18 ? { nsfw: true } : {}),
    },
    source: 'json',
  };
}

function galleryOf(p: Obj): MediaItem[] {
  if (!p.is_gallery || !p.gallery_data?.items) return [];
  const out: MediaItem[] = [];
  for (const it of p.gallery_data.items as Obj[]) {
    const m = p.media_metadata?.[it.media_id];
    if (!m || m.status !== 'valid') continue;
    const s = m.s || {};
    if (m.e === 'AnimatedImage' && s.mp4) out.push({ kind: 'gif', url: s.mp4, alt: it.caption || undefined, downloadable: true });
    else if (s.u || s.gif) out.push({ kind: 'image', url: s.u || s.gif, alt: it.caption || undefined, downloadable: true, width: s.x, height: s.y });
  }
  return out;
}

/** 正文里的内嵌图片：![img](媒体ID) 或单独一行的 preview.redd.it / i.redd.it 链接 → 标准图片语法 */
function inlineMedia(text: string, meta: Obj | undefined): string {
  return text
    .replace(/!\[(img|gif)\]\(([a-z0-9]+)\)/gi, (whole, _k, id: string) => {
      const s = meta?.[id]?.s;
      const u = s?.u || s?.gif;
      return u ? `![](${u})` : whole;
    })
    .replace(/^(https:\/\/(?:preview|i)\.redd\.it\/\S+)$/gm, (url) => (isImageUrl(url) || /format=(png|jpg|jpeg|webp|gif)/.test(url) ? `![](${url})` : url));
}

function commentsOf(listing: Obj | undefined, opts: RedditOptions): CommentNode[] {
  const per = opts.repliesPerComment ?? 3;
  const maxDepth = opts.maxDepth ?? 3;
  const top = opts.topComments;
  if (!top) return [];

  const walk = (children: Obj[] | undefined, depth: number, limit: number): CommentNode[] =>
    (children || [])
      .filter((c) => c.kind === 't1' && c.data && !c.data.stickied && c.data.author !== 'AutoModerator' && c.data.body && c.data.body !== '[removed]')
      .map((c) => c.data as Obj)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, limit)
      .map((d) => ({
        author: d.author === '[deleted]' ? '[deleted]' : `u/${d.author}`,
        text: String(d.body),
        likes: num(d.score),
        published: d.created_utc ? new Date(d.created_utc * 1000).toISOString().replace('.000Z', 'Z') : undefined,
        children: depth + 1 < maxDepth && d.replies?.data?.children ? emptyToUndef(walk(d.replies.data.children, depth + 1, per)) : undefined,
      }));

  return walk(listing?.data?.children, 0, top);
}

function previewImage(p: Obj): string | undefined {
  const u = p.preview?.images?.[0]?.source?.url;
  return typeof u === 'string' ? u : undefined;
}

const isImageUrl = (u: unknown) => typeof u === 'string' && /^https:\/\/(i\.redd\.it|i\.imgur\.com|preview\.redd\.it)\/.+\.(jpe?g|png|gif|webp)(\?|$)/i.test(u);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const emptyToUndef = <T,>(a: T[]) => (a.length ? a : undefined);
