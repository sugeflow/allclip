// Reddit 适配器：帖子页直接用；信息流里取屏幕中间那条。
// 数据：同源请求 /comments/<id>.json?raw_json=1（Reddit 公开格式，带用户自己的登录状态），
// 拿不到时读新版页面的 <shreddit-post> 元素。
import { htmlToMarkdown } from '../../core/html-md';
import { liftImages } from '../../core/media-md';
import { contextItem } from '../../core/context-mark';
import { loadSettings } from '../../core/settings';
import type { ClipDoc, MediaItem } from '../../core/types';
import { AdapterError } from '../errors';
import type { Adapter } from '../registry';
import { buildRedditDoc } from './convert';
import { REDDIT_ITEM } from './selectors';

export const redditAdapter: Adapter = {
  platform: 'reddit',
  match: (url) => /(^|\.)reddit\.com$/.test(url.hostname),
  async extract(): Promise<ClipDoc | null> {
    // 刚右键过的帖子 > 地址里的帖子 > 屏幕中间那条
    const ctx = contextItem(REDDIT_ITEM);
    if (ctx?.classList.contains('thing')) ctx.setAttribute('permalink', ctx.getAttribute('data-permalink') || '');
    const fromUrl = ctx ? undefined : location.pathname.match(/\/comments\/([a-z0-9]+)/i)?.[1];
    const el = ctx || (fromUrl ? null : postInView());
    const id = fromUrl || el?.getAttribute('id')?.replace(/^t3_/, '') || el?.getAttribute('permalink')?.match(/\/comments\/([a-z0-9]+)/i)?.[1];
    if (!id) {
      if (/^\/(r|user|u)\/[^/]+\/?$|^\/$|^\/(best|hot|new|top|rising)\b/.test(location.pathname)) {
        throw new AdapterError('打开一个帖子，或把想保存的帖子滚到屏幕中间再保存');
      }
      return null;
    }

    const settings = await loadSettings().catch(() => null);
    const topComments = settings?.redditTopComments ?? 10;
    try {
      const res = await fetch(`${location.origin}/comments/${id}.json?raw_json=1&sort=top&limit=100`, { credentials: 'include' });
      if (res.ok) {
        const doc = buildRedditDoc(await res.json(), { topComments });
        if (doc) return doc;
      }
    } catch (e) {
      console.warn('[AllClip] Reddit JSON 失败，改读页面', e);
    }

    const post = fromUrl ? document.querySelector('shreddit-post') : el;
    const fallback = post ? domPost(post, id) : null;
    if (fallback) return fallback;
    throw new AdapterError('没读到这个帖子，等页面加载完再试');
  },
};

/** 信息流里屏幕中线穿过的帖子 */
function postInView(): Element | null {
  const mid = window.innerHeight / 2;
  let best: Element | null = null;
  let bestDist = Infinity;
  for (const el of document.querySelectorAll(REDDIT_ITEM)) {
    const r = el.getBoundingClientRect();
    if (!r.height) continue;
    const dist = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
    if (dist < bestDist) {
      best = el;
      bestDist = dist;
    }
  }
  if (best?.classList.contains('thing')) {
    // 旧版 Reddit：把 data-permalink 映射成和新版一样的属性
    best.setAttribute('permalink', best.getAttribute('data-permalink') || '');
  }
  return bestDist < window.innerHeight ? best : null;
}

/** 新版 Reddit 的 <shreddit-post>：标题、作者、分数等在属性上，正文在 [slot="text-body"] 里 */
function domPost(sp: Element, id: string): ClipDoc | null {
  const attr = (n: string) => (sp.getAttribute(n) || '').trim();
  const title = attr('post-title');
  if (!title) return null;
  const bodyEl = sp.querySelector('[slot="text-body"]');
  let text = bodyEl ? htmlToMarkdown(bodyEl.innerHTML) : '';

  const media: MediaItem[] = [];
  const type = attr('post-type');
  const href = attr('content-href');
  if (type === 'video' || sp.querySelector('shreddit-player, shreddit-player-2')) {
    media.push({ kind: 'video', url: location.origin + attr('permalink'), downloadable: false });
  } else {
    for (const img of sp.querySelectorAll('img')) {
      const src = img.getAttribute('src') || '';
      if (/^https:\/\/(i|preview)\.redd\.it\//.test(src) && !media.some((m) => m.url === src)) media.push({ kind: 'image', url: src, downloadable: true });
    }
  }
  const lifted = liftImages(text, media);
  text = lifted.body;
  const parts = [lifted.media.map((_, i) => `{{media:${i}}}`).filter((t) => !text.includes(t)).join('\n\n'), text];
  if (type === 'link' && href && !/reddit\.com/.test(href)) parts.push(`🔗 [${title}](${href})`);

  const author = attr('author');
  const sub = attr('subreddit-prefixed-name');
  const score = Number(attr('score'));
  const comments = Number(attr('comment-count'));
  return {
    platform: 'reddit',
    kind: 'post',
    id,
    url: `https://www.reddit.com${attr('permalink') || `/comments/${id}`}`,
    title,
    author: { name: author || '[deleted]', url: author ? `https://www.reddit.com/user/${author}` : undefined },
    published: attr('created-timestamp') || undefined,
    tags: sub ? [sub.replace(/^r\//, '')] : [],
    stats: { score: Number.isFinite(score) ? score : undefined, replies: Number.isFinite(comments) ? comments : undefined },
    body: parts.filter(Boolean).join('\n\n'),
    media: lifted.media,
    site: sub || undefined,
    extra: { hint: '没拿到帖子的完整数据（含评论），这次是从页面读的。' },
    source: 'dom',
  };
}
