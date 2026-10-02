// 小红书笔记数据 → ClipDoc。纯函数。
// 同一份笔记有两种来源、两种字段写法：页面状态 __INITIAL_STATE__ 里是驼峰（imageList、urlDefault），
// 接口 /api/sns/web/v1/feed 返回的是下划线（image_list、url_default），这里统一用 g() 两种都读。
import { mediaToken, type ClipDoc, type CommentNode, type MediaItem, type Stats } from '../../core/types';

type Obj = Record<string, unknown>;

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
/** 读字段：先驼峰，再下划线 */
function g<T = unknown>(o: unknown, key: string): T | undefined {
  if (!o || typeof o !== 'object') return undefined;
  const r = o as Obj;
  return (r[key] ?? r[snake(key)]) as T | undefined;
}
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

export interface XhsPayload {
  note: Obj;
  comments?: Obj[];
}

export function buildXhsDoc(p: XhsPayload): ClipDoc | null {
  const n = p.note;
  const id = str(g(n, 'noteId') ?? g(n, 'id'));
  if (!/^[0-9a-f]{24}$/i.test(id)) return null;

  const user = g<Obj>(n, 'user') || {};
  const userId = str(g(user, 'userId'));
  const media: MediaItem[] = [];
  const isVideo = str(g(n, 'type')) === 'video';
  const images = arr(g(n, 'imageList'));

  if (isVideo) {
    const v = videoOf(g<Obj>(n, 'video'), imageUrl(images[0]));
    if (v) media.push(v);
  } else {
    for (const img of images) {
      const url = imageUrl(img);
      if (!url) continue;
      media.push({ kind: 'image', url, width: num(g(img, 'width')), height: num(g(img, 'height')), downloadable: true });
      // 实况图（Live Photo）：静态图之外再附上那段短视频
      if (g(img, 'livePhoto')) {
        const clip = bestStream(g<Obj>(img, 'stream'));
        if (clip) media.push({ kind: 'video', url: clip.url, alt: '实况', downloadable: true, variants: clip.variants, durationMs: clip.durationMs });
      }
    }
  }

  const tags = arr(g(n, 'tagList'))
    .filter((t) => !g(t, 'type') || g(t, 'type') === 'topic')
    .map((t) => str(g(t, 'name')).trim())
    .filter(Boolean);

  const text = descToMarkdown(str(g(n, 'desc')));
  const tokens = media.map((_, i) => mediaToken(i));
  // 视频放最前面；图文笔记先文字后图集
  const body = isVideo ? [tokens.join('\n'), text].filter(Boolean).join('\n\n') : [text, tokens.join('\n\n')].filter(Boolean).join('\n\n');

  const ip = str(g(n, 'ipLocation'));
  return {
    platform: 'xiaohongshu',
    kind: 'note',
    id: id.toLowerCase(),
    url: `https://www.xiaohongshu.com/explore/${id.toLowerCase()}`,
    title: str(g(n, 'title') ?? g(n, 'displayTitle')).trim(),
    author: {
      name: str(g(user, 'nickname') ?? g(user, 'nickName')).trim() || '小红书用户',
      url: userId ? `https://www.xiaohongshu.com/user/profile/${userId}` : undefined,
      avatar: str(g(user, 'avatar')) || undefined,
    },
    published: msToIso(g(n, 'time')),
    updated: msToIso(g(n, 'lastUpdateTime')),
    tags,
    stats: statsOf(g<Obj>(n, 'interactInfo')),
    body,
    media,
    comments: p.comments?.length ? p.comments.map(commentOf) : undefined,
    extra: ip ? { ip_location: ip } : undefined,
    source: 'state',
  };
}

/** 正文：话题 #xxx[话题]# → \#xxx（显示成 #xxx 但不在 Obsidian 里生成标签，标签已写进 frontmatter）；\n\t\n 分段 */
export function descToMarkdown(desc: string): string {
  return desc
    .replace(/#([^#\n[]+?)\[话题\]#/g, '\\#$1')
    .replace(/\r/g, '')
    .replace(/\n[\t ]*\n/g, '\n\n')
    .replace(/\t/g, '')
    .split('\n')
    .map((l) => l.replace(/^(#{1,6}\s)/, '\\$1').replace(/^>/, '\\>').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 图片：默认清晰度那张（WB_DFT）；链接是 http，统一换成 https */
export function imageUrl(img: Obj | undefined): string {
  if (!img) return '';
  let u = str(g(img, 'urlDefault'));
  if (!u) {
    const info = arr(g(img, 'infoList'));
    u = str(g(info.find((i) => g(i, 'imageScene') === 'WB_DFT') || info[info.length - 1], 'url'));
  }
  if (!u) u = str(g(img, 'url') ?? g(img, 'urlPre'));
  return https(u);
}

function videoOf(video: Obj | undefined, poster: string): MediaItem | null {
  const s = bestStream(g<Obj>(g<Obj>(video, 'media'), 'stream'));
  if (!s) return null;
  return { kind: 'video', url: s.url, poster: poster || undefined, downloadable: true, variants: s.variants, durationMs: s.durationMs };
}

/**
 * 视频流：stream 下按编码分组（老版本是 h264/h265/av1，现在是 EF4/EF5…），每组若干清晰度。
 * 优先普通 mp4（单文件，哪里都能播），其次分片 mp4；按大小从大到小排，下载时挑不超过上限的那档。
 */
function bestStream(stream: Obj | undefined): { url: string; variants: MediaItem['variants']; durationMs?: number } | null {
  if (!stream) return null;
  const all: { url: string; size: number; mp4: boolean; bitrate: number; duration?: number }[] = [];
  for (const list of Object.values(stream)) {
    for (const s of arr(list)) {
      const url = https(str(g(s, 'masterUrl')) || str(arr(g(s, 'backupUrls'))[0] ?? ''));
      if (!url) continue;
      all.push({
        url,
        size: num(g(s, 'size')) || 0,
        mp4: str(g(s, 'format')) === 'mp4' || /\.mp4(\?|$)/.test(url),
        bitrate: num(g(s, 'avgBitrate')) || num(g(s, 'videoBitrate')) || 0,
        duration: num(g(s, 'duration')),
      });
    }
  }
  if (!all.length) return null;
  const mp4 = all.filter((s) => s.mp4);
  const pool = (mp4.length ? mp4 : all).sort((a, b) => b.size - a.size || b.bitrate - a.bitrate);
  return {
    url: pool[0]!.url,
    variants: pool.map((s) => ({ url: s.url, bitrate: s.bitrate || undefined, size: s.size || undefined })),
    durationMs: pool[0]!.duration,
  };
}

function commentOf(c: Obj): CommentNode {
  const user = g<Obj>(c, 'userInfo');
  const subs = arr(g(c, 'subComments'));
  return {
    author: str(g(user, 'nickname')) || '用户',
    text: str(g(c, 'content')),
    likes: parseCount(g(c, 'likeCount')),
    published: msToIso(g(c, 'createTime')),
    children: subs.length ? subs.map(commentOf) : undefined,
  };
}

function statsOf(i: Obj | undefined): Stats | undefined {
  if (!i) return undefined;
  const s: Stats = {};
  const set = (k: keyof Stats, v: unknown) => {
    const n = parseCount(v);
    if (n != null) s[k] = n;
  };
  set('likes', g(i, 'likedCount'));
  set('collects', g(i, 'collectedCount'));
  set('replies', g(i, 'commentCount'));
  set('reposts', g(i, 'shareCount'));
  return s;
}

/** "2.8万" → 28000，"1千+" → 1000，"10+" → 10，"1w" → 10000 */
export function parseCount(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  const s = str(v).trim().replace(/,/g, '');
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(万|w|W|千|k|K|亿)?\+?$/);
  if (!m) return undefined;
  const unit = m[2] ? ({ 万: 1e4, w: 1e4, W: 1e4, 千: 1e3, k: 1e3, K: 1e3, 亿: 1e8 } as Record<string, number>)[m[2]]! : 1;
  return Math.round(Number(m[1]) * unit);
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function msToIso(v: unknown): string | undefined {
  const n = num(v);
  return n ? new Date(n).toISOString().replace('.000Z', 'Z') : undefined;
}

const https = (u: string) => u.replace(/^http:\/\//, 'https://');
