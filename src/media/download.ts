// 在后台下载媒体：后台请求不带页面 Referer，知乎这类防盗链图片也能拿到。
import type { MediaItem } from '../core/types';

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

export interface Downloaded {
  bytes: ArrayBuffer;
  mime: string;
  ext: string;
}

export async function download(m: MediaItem, maxBytes: number): Promise<Downloaded> {
  const url = pickVariant(m, maxBytes);
  const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len && len > maxBytes) throw new Error('文件超过大小上限');
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > maxBytes) throw new Error('文件超过大小上限');
  const mime = (res.headers.get('content-type') || '').split(';')[0]!.trim().toLowerCase();
  return { bytes, mime, ext: MIME_EXT[mime] || extFromUrl(url) || (m.kind === 'image' ? 'jpg' : 'mp4') };
}

function extFromUrl(u: string): string | undefined {
  try {
    const p = new URL(u);
    const fmt = p.searchParams.get('format'); // pbs.twimg.com/media/xxx?format=jpg
    if (fmt) return fmt;
    return p.pathname.match(/\.([a-z0-9]{2,4})$/i)?.[1]?.toLowerCase();
  } catch {
    return undefined;
  }
}

/** 并发执行，保持结果顺序 */
export async function pool<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * 多档清晰度的视频：挑不超过上限的最高档；都超就用最低档试试。
 * 有精确大小（小红书）用精确大小，否则按“码率 × 时长”估算（X）。
 */
export function pickVariant(m: MediaItem, maxBytes: number): string {
  const vs = m.variants;
  if (!vs?.length) return m.url;
  const est = (v: NonNullable<MediaItem['variants']>[number]) =>
    v.size ?? (m.durationMs && v.bitrate ? ((v.bitrate * m.durationMs) / 8000) * 1.1 : undefined);
  const sorted = [...vs].sort((a, b) => (est(b) ?? b.bitrate ?? 0) - (est(a) ?? a.bitrate ?? 0));
  const fit = sorted.find((v) => {
    const e = est(v);
    return e === undefined || e <= maxBytes;
  });
  return (fit || sorted[sorted.length - 1]!).url;
}
