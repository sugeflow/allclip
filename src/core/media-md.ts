// 把 Markdown 里的图片抽成 MediaItem，并替换为 {{media:N}} 占位符。
// 这样渲染时才能统一决定：存本地附件 ![[...]]，还是保留远程链接。
import { mediaToken, type MediaItem } from './types';

// ![alt](url "title") —— url 不含空白和右括号
const IMG_RE = /!\[([^\]\n]*)\]\((\S+?)(?:\s+"[^"]*")?\)/g;

export function liftImages(
  markdown: string,
  media: MediaItem[] = [],
): { body: string; media: MediaItem[] } {
  const seen = new Map<string, number>();
  media.forEach((m, i) => seen.set(m.url, i));
  const body = markdown.replace(IMG_RE, (whole, alt: string, url: string) => {
    if (!/^https?:\/\//.test(url)) return whole; // data:/blob:/相对路径不处理
    let idx = seen.get(url);
    if (idx == null) {
      idx = media.length;
      media.push({ kind: 'image', url, alt: alt || undefined, downloadable: true });
      seen.set(url, idx);
    }
    return mediaToken(idx);
  });
  return { body, media };
}

/** 去掉常见跟踪参数，作为规范链接 */
export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|spm|fbclid|gclid|share_|xsec_|s$|t$|ref_src|ref$)/i.test(k)) u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return raw;
  }
}

/** URL → 短哈希，作为通用网页的 ID */
export async function shortHash(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)]
    .slice(0, 6)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
