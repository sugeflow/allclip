// X Article（长文）：正文是 Draft.js 的 content_state（blocks + entityMap），转成 Markdown。
import { mediaToken, type MediaItem } from '../../core/types';
import { origImage } from './convert';
import type { DraftBlock, DraftEntity, RawArticle } from './raw';

export function articleToMarkdown(a: RawArticle, media: MediaItem[]): string {
  const out: string[] = [];
  const cover = a.cover_media?.media_info?.original_img_url;
  if (cover) {
    media.push({ kind: 'image', url: origImage(cover), downloadable: true });
    out.push(mediaToken(media.length - 1));
  }

  const blocks = a.content_state?.blocks || [];
  if (!blocks.length) {
    if (a.preview_text) out.push(a.preview_text.trim());
    return out.join('\n\n');
  }
  const entities = entityMapOf(a);
  const mediaById = new Map<string, string>();
  for (const m of a.media_entities || []) {
    const url = m.media_info?.original_img_url;
    if (url && m.media_id) mediaById.set(String(m.media_id), url);
  }

  let olIndex = 0;
  for (const b of blocks) {
    const type = b.type || 'unstyled';
    if (type !== 'ordered-list-item') olIndex = 0;
    if (type === 'atomic') {
      const md = atomic(b, entities, mediaById, media);
      if (md) out.push(md);
      continue;
    }
    // 标题整行加粗时去掉加粗（标题本身已经是粗体）
    const isHeader = type.startsWith('header-');
    const text = inline(isHeader ? stripFullStyle(b) : b, entities);
    const indent = '  '.repeat(b.depth || 0);
    switch (type) {
      case 'header-one':
        out.push(`## ${text}`);
        break;
      case 'header-two':
        out.push(`### ${text}`);
        break;
      case 'header-three':
        out.push(`#### ${text}`);
        break;
      case 'unordered-list-item':
        out.push(`${indent}- ${text}`);
        break;
      case 'ordered-list-item':
        out.push(`${indent}${++olIndex}. ${text}`);
        break;
      case 'blockquote':
        out.push(text.split('\n').map((l) => `> ${l}`).join('\n'));
        break;
      case 'code-block':
        out.push('```\n' + (b.text || '') + '\n```');
        break;
      default:
        if (text.trim()) out.push(text);
    }
  }
  // 连续的列表项之间不要空行
  return out.join('\n\n').replace(/\n\n(?=\s*(?:- |\d+\. ))/g, (m, offset: number, all: string) => {
    const prev = all.slice(0, offset).split('\n').pop() || '';
    return /^\s*(?:- |\d+\. )/.test(prev) ? '\n' : m;
  });
}

function stripFullStyle(b: DraftBlock): DraftBlock {
  const len = Array.from(b.text || '').length;
  return { ...b, inlineStyleRanges: (b.inlineStyleRanges || []).filter((s) => !(s.offset === 0 && s.length >= len)) };
}

function entityMapOf(a: RawArticle): Map<string, DraftEntity> {
  const m = new Map<string, DraftEntity>();
  const raw = a.content_state?.entityMap;
  if (Array.isArray(raw)) {
    for (const e of raw) if (e?.key != null && e.value) m.set(String(e.key), e.value);
  } else if (raw) {
    for (const [k, v] of Object.entries(raw)) m.set(k, v);
  }
  return m;
}

function atomic(b: DraftBlock, entities: Map<string, DraftEntity>, mediaById: Map<string, string>, media: MediaItem[]): string {
  const parts: string[] = [];
  for (const r of b.entityRanges || []) {
    const e = entities.get(String(r.key));
    const type = (e?.type || '').toUpperCase();
    const data = e?.data || {};
    if (type === 'MEDIA' || type === 'IMAGE') {
      for (const it of data.mediaItems || []) {
        const url = mediaById.get(String(it.mediaId ?? it.media_id ?? ''));
        if (!url) continue;
        media.push({ kind: 'image', url: origImage(url), downloadable: true });
        parts.push(mediaToken(media.length - 1));
      }
    } else if (type === 'TWEET' && data.tweetId) {
      parts.push(`> [!quote] 引用的推文\n> https://x.com/i/status/${data.tweetId}`);
    } else if (type === 'MARKDOWN' && typeof data.markdown === 'string') {
      parts.push(data.markdown.trim());
    } else if (type === 'DIVIDER') {
      parts.push('---');
    } else if (data.url) {
      parts.push(String(data.url));
    }
  }
  return parts.join('\n\n');
}

/** 行内：加粗/斜体/删除线 + 链接。按码位处理下标。 */
function inline(b: DraftBlock, entities: Map<string, DraftEntity>): string {
  const chars = Array.from(b.text || '');
  const open: string[][] = chars.map(() => []);
  const close: string[][] = chars.map(() => []);
  const mark = (offset: number, length: number, start: string, end: string) => {
    if (length <= 0 || offset >= chars.length) return;
    const last = Math.min(offset + length, chars.length) - 1;
    open[offset]!.push(start);
    close[last]!.unshift(end);
  };
  for (const s of b.inlineStyleRanges || []) {
    const style = s.style.toUpperCase();
    if (style === 'BOLD') mark(s.offset, s.length, '**', '**');
    else if (style === 'ITALIC') mark(s.offset, s.length, '*', '*');
    else if (style === 'STRIKETHROUGH') mark(s.offset, s.length, '~~', '~~');
  }
  for (const r of b.entityRanges || []) {
    const e = entities.get(String(r.key));
    if ((e?.type || '').toUpperCase() === 'LINK' && e?.data?.url) mark(r.offset, r.length, '[', `](${e.data.url})`);
  }
  return chars.map((c, i) => open[i]!.join('') + c + close[i]!.join('')).join('');
}
