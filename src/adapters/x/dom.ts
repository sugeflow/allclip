// DOM 兜底：拦截脚本没拿到数据时（比如插件装好后页面还没刷新）直接读页面。
// 只能拿到单条推文；长推文可能被“显示更多”截断，视频拿不到直链。
import { mediaToken, type ClipDoc, type MediaItem } from '../../core/types';
import { origImage } from './convert';

export function findTweetArticle(id?: string): Element | null {
  const all = [...document.querySelectorAll('article[data-testid="tweet"]')];
  if (id) {
    const hit = all.find((a) => a.querySelector(`a[href*="/status/${id}"] time`));
    if (hit) return hit;
  }
  return all[0] || null;
}

export function domTweet(article: Element): ClipDoc | null {
  // 引用的推文嵌在 div[role="link"] 里，读主推文时要跳过它
  const own = <T extends Element>(sel: string) => [...article.querySelectorAll<T>(sel)].filter((el) => !inQuote(el, article));
  const timeLink = own('a[href*="/status/"]').find((a) => a.querySelector('time'));
  const id = timeLink?.getAttribute('href')?.match(/\/status\/(\d+)/)?.[1];
  if (!id) return null;

  const { name, handle } = authorOf(own('[data-testid="User-Name"]')[0]);
  const textEl = own('[data-testid="tweetText"]')[0];
  const text = textEl ? textWithLinks(textEl) : '';

  const media: MediaItem[] = [];
  const tokens = (root: Element[], into: string[]) => {
    for (const img of root) {
      const src = img.getAttribute('src') || '';
      if (!/pbs\.twimg\.com\/media\//.test(src)) continue;
      media.push({ kind: 'image', url: origImage(src), alt: altOf(img), downloadable: true });
      into.push(mediaToken(media.length - 1));
    }
  };
  const mainTokens: string[] = [];
  tokens(own('[data-testid="tweetPhoto"] img'), mainTokens);
  if (own('[data-testid="videoPlayer"]').length) {
    const poster = own('[data-testid="videoPlayer"] video')[0]?.getAttribute('poster') || '';
    media.push({ kind: 'video', url: location.origin + timeLink!.getAttribute('href'), poster: poster || undefined, downloadable: false });
    mainTokens.push(mediaToken(media.length - 1));
  }

  const parts = [text, mainTokens.join('\n')];
  const quote = article.querySelector('div[role="link"]');
  if (quote && quote.querySelector('[data-testid="tweetText"], [data-testid="tweetPhoto"]')) {
    const q = authorOf(quote.querySelector('[data-testid="User-Name"]'));
    const qText = quote.querySelector('[data-testid="tweetText"]');
    const qTokens: string[] = [];
    tokens([...quote.querySelectorAll('[data-testid="tweetPhoto"] img')], qTokens);
    const inner = [qText ? textWithLinks(qText) : '', qTokens.join('\n')].filter(Boolean).join('\n\n');
    parts.push([`[!quote] 引用 ${q.name}${q.handle ? ` ${q.handle}` : ''}`, ...inner.split('\n')].map((l) => (l ? `> ${l}` : '>')).join('\n'));
  }

  const user = handle.slice(1);
  return {
    platform: 'x',
    kind: 'post',
    id,
    url: `https://x.com/${user || 'i'}/status/${id}`,
    title: '',
    author: { name, handle: handle || undefined, url: user ? `https://x.com/${user}` : undefined },
    published: timeLink!.querySelector('time')?.getAttribute('datetime') || undefined,
    tags: [],
    body: parts.filter(Boolean).join('\n\n'),
    media,
    extra: { hint: '这条是直接从页面文字读的。刷新页面后再存，能拿到完整长文、线程和视频。' },
    source: 'dom',
  };
}

function inQuote(el: Element, article: Element): boolean {
  const box = el.closest('div[role="link"]');
  return !!box && article.contains(box);
}

function authorOf(box: Element | null | undefined): { name: string; handle: string } {
  const spans = [...(box?.querySelectorAll('span') || [])].map((s) => (s.textContent || '').trim());
  const handle = spans.find((t) => /^@\w+$/.test(t)) || '';
  const name = spans.find((t) => t && !t.startsWith('@') && t !== '·') || handle;
  return { name, handle };
}

/** X 给没写描述的图片默认 alt 为 "Image"，这种不要 */
function altOf(img: Element): string | undefined {
  const alt = img.getAttribute('alt') || '';
  return alt && alt !== 'Image' && alt !== '图像' ? alt : undefined;
}

/** 推文正文：链接用 href（t.co 能跳转），表情图片用 alt，剥掉沉浸式翻译之类插件插入的节点 */
function textWithLinks(el: Element): string {
  let out = '';
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      out += n.textContent;
      return;
    }
    if (!(n instanceof Element)) return;
    if (/immersive-translate/.test(n.className?.toString() || '')) return;
    if (n.tagName === 'IMG') {
      out += n.getAttribute('alt') || '';
      return;
    }
    if (n.tagName === 'BR') {
      out += '\n';
      return;
    }
    if (n.tagName === 'A') {
      const href = n.getAttribute('href') || '';
      const label = (n.textContent || '').replace(/…$/, '').trim();
      if (/^https?:\/\/t\.co\//.test(href)) {
        out += `[${label}](${href})`;
        return;
      }
    }
    n.childNodes.forEach(walk);
  };
  walk(el);
  return out.trim();
}
