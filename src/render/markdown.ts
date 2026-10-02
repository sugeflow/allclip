// ClipDoc → Obsidian 笔记（frontmatter + 正文 + 引用 + 评论 + 我的备注）
import { MEDIA_TOKEN_RE, type ClipDoc, type CommentNode, type MediaItem, type SaveOptions } from '../core/types';
import { titleOf } from './filename';

export const NOTE_HEADING = '## 我的备注';

/** 第 i 个媒体落地后的本地路径（Vault 内）；没有则用远程链接 */
export type LocalMedia = Map<number, string>;

export interface RenderConfig {
  /** 新笔记的 status 字段，默认 inbox */
  status?: string;
  /** 每篇都加上的标签 */
  extraTags?: string[];
}

export interface RenderInput {
  doc: ClipDoc;
  options: SaveOptions;
  local: LocalMedia;
  clipped?: Date;
  config?: RenderConfig;
}

export function renderNote({ doc, options, local, clipped = new Date(), config = {} }: RenderInput): string {
  const title = options.title?.trim() || titleOf(doc);
  const used = new Set<number>();
  const mediaMd = (i: number) => {
    used.add(i);
    const m = doc.media[i];
    return m ? renderMedia(m, local.get(i)) : '';
  };

  const sections: string[] = [];
  const body = doc.body.replace(MEDIA_TOKEN_RE, (_, n: string) => mediaMd(Number(n)));

  sections.push(body.trim());

  // 正文里没有出现的媒体（例如适配器单独给出的图集）统一放到正文后面
  const rest = doc.media.map((_, i) => i).filter((i) => !used.has(i));
  if (rest.length) sections.push(rest.map(mediaMd).join('\n\n'));

  if (doc.quoted) sections.push(renderQuoted(doc.quoted));

  if (options.includeComments && doc.comments?.length) {
    sections.push('## 评论\n\n' + renderComments(doc.comments));
  }

  sections.push(NOTE_HEADING + '\n\n' + (options.note?.trim() || ''));

  return frontmatter(doc, title, [...(config.extraTags || []), ...(options.tags || [])], clipped, config.status) + '\n' + sections.filter(Boolean).join('\n\n') + '\n';
}

function renderMedia(m: MediaItem, localPath?: string): string {
  if (m.kind === 'video' || m.kind === 'gif') {
    if (localPath) return `![[${localPath}]]`;
    const poster = m.poster ? `![${m.alt || ''}](${m.poster})\n` : '';
    return `${poster}[▶ 视频](${m.url})`;
  }
  if (localPath) return `![[${localPath}]]`;
  return `![${m.alt || ''}](${m.url})`;
}

function renderQuoted(q: ClipDoc): string {
  const who = q.author.handle || q.author.name;
  const inner = q.body.replace(MEDIA_TOKEN_RE, (_, n: string) => {
    const m = q.media[Number(n)];
    return m ? renderMedia(m) : '';
  });
  const lines = [`[!quote] 引用 ${who}${q.url ? ` · [原文](${q.url})` : ''}`, ...inner.trim().split('\n')];
  return lines.map((l) => (l ? `> ${l}` : '>')).join('\n');
}

export function renderComments(list: CommentNode[], depth = 0): string {
  const pad = '  '.repeat(depth);
  return list
    .map((c) => {
      const likes = c.likes != null ? ` · ${c.likes} 赞` : '';
      const text = c.text.replace(/\s*\n\s*/g, ' ').trim();
      const head = `${pad}- **${c.author}**${likes}：${text}`;
      return c.children?.length ? head + '\n' + renderComments(c.children, depth + 1) : head;
    })
    .join('\n');
}

// ---------- frontmatter ----------

function yamlStr(v: string): string {
  return JSON.stringify(v); // JSON 字符串就是合法的 YAML 双引号字符串
}

function tagSafe(t: string): string {
  return t.trim().replace(/^#/, '').replace(/\s+/g, '-').replace(/[,#]/g, '');
}

export function frontmatter(doc: ClipDoc, title: string, userTags: string[], clipped: Date, status = 'inbox'): string {
  const tags = [...new Set([`allclip/${doc.platform}`, ...doc.tags, ...userTags].map(tagSafe).filter(Boolean))];
  const lines: string[] = ['---'];
  const put = (k: string, v: string | number | undefined) => {
    if (v === undefined || v === '') return;
    lines.push(`${k}: ${typeof v === 'number' ? v : yamlStr(v)}`);
  };
  put('title', title);
  put('platform', doc.platform);
  put('kind', doc.kind);
  put('source', doc.url);
  put('id', doc.id);
  put('site', doc.site);
  put('author', doc.author.name);
  put('author_handle', doc.author.handle);
  put('author_url', doc.author.url);
  put('published', doc.published);
  put('clipped', isoLocal(clipped));
  put('description', doc.description?.slice(0, 200));
  lines.push('tags:');
  for (const t of tags) lines.push(`  - ${yamlStr(t)}`);
  for (const [k, v] of Object.entries(doc.stats || {})) put(k, v);
  // 平台附加信息（IP 属地、作者简介、线程条数、摘录来源……），只写简单值
  for (const [k, v] of Object.entries(doc.extra || {})) {
    if (k === 'hint' || k === 'cover') continue;
    if (typeof v === 'string' || typeof v === 'number') put(k, v);
    else if (typeof v === 'boolean') lines.push(`${k}: ${v}`);
  }
  put('status', status.trim() || 'inbox');
  lines.push('---');
  return lines.join('\n');
}

/** 带时区的本地时间：2026-10-02T10:05:12+08:00 */
export function isoLocal(d: Date): string {
  const p = (n: number) => String(Math.abs(n)).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
    `${sign}${p(Math.trunc(off / 60))}:${p(off % 60)}`
  );
}

/**
 * 更新已存在的笔记时，保留旧笔记“我的备注”下面写的内容；
 * 这次弹窗里新写的备注追加在后面。
 */
export function mergeNote(existing: string, fresh: string): string {
  const oldIdx = existing.indexOf('\n' + NOTE_HEADING);
  if (oldIdx < 0) return fresh;
  const oldNote = existing.slice(oldIdx + NOTE_HEADING.length + 1).trim();
  if (!oldNote) return fresh;
  const newIdx = fresh.indexOf('\n' + NOTE_HEADING);
  const head = fresh.slice(0, newIdx);
  const newNote = fresh.slice(newIdx + NOTE_HEADING.length + 1).trim();
  const merged = newNote && !oldNote.includes(newNote) ? `${oldNote}\n\n${newNote}` : oldNote;
  return `${head}\n${NOTE_HEADING}\n\n${merged}\n`;
}
