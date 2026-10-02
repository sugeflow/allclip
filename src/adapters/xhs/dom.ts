// DOM 兜底：页面脚本拿不到数据时（插件装好后页面没刷新）读已渲染的笔记。只有图文能拿全，视频只存封面。
import { mediaToken, type ClipDoc, type MediaItem, type Stats } from '../../core/types';
import { AdapterError } from '../errors';
import { imageUrl, parseCount } from './convert';

const visible = (el: Element | null | undefined): el is HTMLElement => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};

/** 当前看的笔记：可见的浮层优先，其次详情页 */
export function currentNoteRoot(): HTMLElement | null {
  const masks = [...document.querySelectorAll('.note-detail-mask')].filter(visible);
  const scope: ParentNode = masks[masks.length - 1] || document;
  return [...scope.querySelectorAll<HTMLElement>('#noteContainer, .note-container')].find((n) => visible(n) && n.querySelector('#detail-desc, #detail-title, .note-content')) || null;
}

/** 笔记 ID：浮层/容器上的 note-id 属性，其次地址栏 */
export function currentNoteId(): string | undefined {
  const root = currentNoteRoot();
  const attr = root?.closest('[note-id]')?.getAttribute('note-id') || root?.getAttribute('note-id');
  const fromUrl = location.pathname.match(/\/(?:explore|discovery\/item|search_result|user\/profile\/\w+)\/([0-9a-f]{24})/i)?.[1];
  const id = (attr || fromUrl || '').toLowerCase();
  return /^[0-9a-f]{24}$/.test(id) ? id : undefined;
}

export function checkBlocked(): void {
  const wall = [...document.querySelectorAll('.login-container, .captcha-container, [class*="verify"]')].find(
    (n) => visible(n) && /扫码登录|安全验证|拖动滑块|验证码/.test((n as HTMLElement).innerText || ''),
  );
  if (wall) throw new AdapterError('小红书弹出了登录或验证，请先在页面上完成，再保存');
}

export function domNote(id: string): ClipDoc | null {
  const root = currentNoteRoot();
  if (!root) return null;
  const read = (sel: string) => ((root.querySelector(sel) as HTMLElement | null)?.innerText || '').trim();

  const descEl = root.querySelector('#detail-desc .note-text') || root.querySelector('#detail-desc');
  const desc = descEl ? descText(descEl) : '';
  const title = read('#detail-title');
  if (!desc && !title) return null;

  const media: MediaItem[] = [];
  const slides = [...root.querySelectorAll('.swiper-slide')].filter((n) => !n.classList.contains('swiper-slide-duplicate'));
  slides.sort((a, b) => Number(a.getAttribute('data-swiper-slide-index') || 0) - Number(b.getAttribute('data-swiper-slide-index') || 0));
  const imgs = slides.length ? slides.flatMap((s) => [...s.querySelectorAll('img')]) : [...root.querySelectorAll<HTMLImageElement>('.media-container img, .img-container img')];
  const seen = new Set<string>();
  for (const img of imgs) {
    if (img.closest('.avatar, .comment-item, .comments-container, .author-wrapper')) continue;
    const url = imageUrl({ urlDefault: img.currentSrc || img.getAttribute('src') || '' });
    if (!/xhscdn\.com|rednotecdn\.com/.test(url) || seen.has(url)) continue;
    seen.add(url);
    media.push({ kind: 'image', url, downloadable: true });
  }
  const isVideo = !!root.querySelector('video, .player-container');
  if (isVideo) {
    const poster = root.querySelector('video')?.getAttribute('poster') || media[0]?.url || '';
    media.splice(0, media.length, { kind: 'video', url: location.href, poster: poster ? imageUrl({ urlDefault: poster }) : undefined, downloadable: false });
  }

  const stats: Stats = {};
  const count = (sel: string) => parseCount(read(`.interact-container ${sel} .count`) || read(`${sel} .count`));
  const likes = count('.like-wrapper');
  const collects = count('.collect-wrapper');
  const replies = count('.chat-wrapper');
  if (likes != null) stats.likes = likes;
  if (collects != null) stats.collects = collects;
  if (replies != null) stats.replies = replies;

  const tags = [...(descEl?.querySelectorAll('a.tag, a#hash-tag') || [])].map((a) => (a.textContent || '').replace(/^#/, '').trim()).filter(Boolean);
  const tokens = media.map((_, i) => mediaToken(i));

  return {
    platform: 'xiaohongshu',
    kind: 'note',
    id,
    url: `https://www.xiaohongshu.com/explore/${id}`,
    title,
    author: { name: read('.author-wrapper .username') || read('.author .username') || '小红书用户' },
    published: parseDate(read('.bottom-container .date')),
    tags,
    stats,
    body: isVideo ? [tokens.join('\n'), desc].filter(Boolean).join('\n\n') : [desc, tokens.join('\n\n')].filter(Boolean).join('\n\n'),
    media,
    extra: {
      hint: isVideo
        ? '这条是直接从页面文字读的，视频只存了封面。刷新页面后再存，能拿到视频和完整数据。'
        : '这条是直接从页面文字读的。刷新页面后再存，数据更完整。',
    },
    source: 'dom',
  };
}

/** 正文：话题链接写成 \#话题，表情图片用 alt */
function descText(el: Element): string {
  let out = '';
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      out += n.textContent;
      return;
    }
    if (!(n instanceof Element)) return;
    if (n.tagName === 'A' && /tag/.test(n.className + ' ' + n.id)) {
      out += '\\#' + (n.textContent || '').replace(/^#/, '').trim();
      return;
    }
    if (n.tagName === 'IMG') {
      out += n.getAttribute('alt') || '';
      return;
    }
    if (n.tagName === 'BR') {
      out += '\n';
      return;
    }
    n.childNodes.forEach(walk);
  };
  walk(el);
  return out.replace(/\n[\t ]*\n/g, '\n\n').replace(/\t/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

/** "2025-04-09" / "编辑于 2025-04-09" / "09-04 浙江"（今年）/ 其余（“3天前”）放弃 */
function parseDate(s: string): string | undefined {
  const full = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (full) return `${full[1]}-${full[2]!.padStart(2, '0')}-${full[3]!.padStart(2, '0')}`;
  const md = s.match(/(?:^|\s)(\d{1,2})-(\d{1,2})(?:\s|$)/);
  if (!md) return undefined;
  const now = new Date();
  let y = now.getFullYear();
  if (Number(md[1]) > now.getMonth() + 1) y -= 1; // 月份比现在大，是去年的
  return `${y}-${md[1]!.padStart(2, '0')}-${md[2]!.padStart(2, '0')}`;
}
