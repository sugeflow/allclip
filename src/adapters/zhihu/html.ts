// 知乎正文 HTML → Markdown。
// 知乎特有的写法（参考 download-zhihu 整理的规则，MIT）：
//   公式  <img eeimg="1|2" alt="tex"> / <span data-eeimg data-tex>     → $tex$ / $$tex$$
//   脚注  <sup data-text data-url data-numero>                          → [^n] + 文末定义
//   图片  <figure><noscript><img/></noscript><img data-original/></figure> → 取 data-original（原图）
//   外链  link.zhihu.com/?target=...                                      → 解码成真实地址
//   卡片  a.LinkCard / a[data-draft-type=link-card]、视频 a.video-box     → 独立一行的链接
//   目录 .Catalog、参考文献 .ReferenceList、空段落                       → 删掉
// 公式和脚注先换成纯字母数字的占位符再交给 Turndown，避免 LaTeX 里的 _ ^ \ 被转义。
import { createTurndown, tidy } from '../../core/html-md';
import { liftImages } from '../../core/media-md';
import type { MediaItem } from '../../core/types';

export interface ZhihuMarkdown {
  body: string;
  media: MediaItem[];
}

export function zhihuHtmlToMarkdown(html: string): ZhihuMarkdown {
  const root = document.createElement('div');
  root.innerHTML = html;
  const slots: string[] = [];
  const slot = (md: string) => `ZHSLOT${slots.push(md) - 1}X`;
  const footnotes: string[] = [];

  root.querySelectorAll('noscript, .Catalog, .ReferenceList, p.ztext-empty-paragraph, style, script').forEach((n) => n.remove());

  // 公式
  root.querySelectorAll('img[eeimg], [data-eeimg], .ztext-math').forEach((el) => {
    const tex = (el.getAttribute('data-tex') || el.getAttribute('alt') || el.textContent || '').trim();
    if (!tex) return el.remove();
    const block = (el.getAttribute('eeimg') || el.getAttribute('data-eeimg')) === '2';
    el.replaceWith(document.createTextNode(slot(block ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`)));
  });

  // 脚注
  root.querySelectorAll('sup[data-text], sup[data-draft-type="reference"]').forEach((el) => {
    const n = el.getAttribute('data-numero') || String(footnotes.length + 1);
    const text = (el.getAttribute('data-text') || '').trim();
    const url = realUrl(el.getAttribute('data-url') || '');
    if (!footnotes.some((f) => f.startsWith(`[^${n}]:`))) footnotes.push(`[^${n}]: ${url ? `[${text || url}](${url})` : text}`);
    el.replaceWith(document.createTextNode(slot(`[^${n}]`)));
  });

  // 图片：取原图，图注作为 alt
  root.querySelectorAll('img').forEach((img) => {
    const src = bestImage(img);
    if (!src) return img.remove();
    const caption = img.closest('figure')?.querySelector('figcaption')?.textContent?.trim() || img.getAttribute('data-caption') || '';
    const clean = document.createElement('img');
    clean.setAttribute('src', src);
    if (caption) clean.setAttribute('alt', caption);
    img.replaceWith(clean);
  });
  root.querySelectorAll('figcaption').forEach((n) => n.remove());

  // 链接卡片、视频：独立成段
  root.querySelectorAll('a.LinkCard, a[data-draft-type="link-card"], a.video-box').forEach((a) => {
    const href = realUrl(a.getAttribute('href') || '');
    const isVideo = a.classList.contains('video-box');
    const title = (a.querySelector('.LinkCard-title, .title, .video-box-title')?.textContent || a.textContent || '').trim() || href;
    const p = document.createElement('p');
    p.textContent = slot(`[${isVideo ? '▶ ' : ''}${escapeLabel(title)}](${href})`);
    a.replaceWith(p);
  });

  // 普通链接：解码跳转；知乎把长链接拆成 invisible/visible 片段，直接用完整地址
  root.querySelectorAll('a[href]').forEach((a) => {
    const href = realUrl(a.getAttribute('href') || '');
    a.setAttribute('href', href);
    if (a.querySelector('.invisible, .visible, .ellipsis')) a.textContent = href;
  });

  let md = tidy(createTurndown().turndown(root));
  md = md.replace(/ZHSLOT(\d+)X/g, (_, i: string) => slots[Number(i)] ?? '');
  md = md.replace(/\n{3,}/g, '\n\n').trim();
  if (footnotes.length) md += '\n\n' + footnotes.join('\n');

  return liftImages(md);
}

/** 原图优先：data-original > data-actualsrc > src（跳过懒加载的占位 svg） */
export function bestImage(img: Element): string {
  for (const attr of ['data-original', 'data-actualsrc', 'data-default-watermark-src', 'src']) {
    const v = img.getAttribute(attr) || '';
    if (/^https?:\/\//.test(v) || v.startsWith('//')) return v.startsWith('//') ? 'https:' + v : v;
  }
  return '';
}

/** link.zhihu.com/?target=xxx → 真实地址 */
export function realUrl(href: string): string {
  href = href.trim();
  if (!href) return '';
  if (href.startsWith('//')) href = 'https:' + href;
  try {
    const u = new URL(href, 'https://www.zhihu.com');
    if (u.hostname === 'link.zhihu.com') {
      const t = u.searchParams.get('target');
      if (t) return decodeURIComponent(t).replace(/^(https?):\/(?!\/)/, '$1://');
    }
    return u.toString();
  } catch {
    return href;
  }
}

const escapeLabel = (s: string) => s.replace(/[[\]]/g, '');
