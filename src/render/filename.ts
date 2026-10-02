// 文件名与路径：Obsidian 不允许 \ / : * ? " < > | # ^ [ ]，也不喜欢换行和首尾的点。
import { PLATFORM_LABEL, type ClipDoc } from '../core/types';

export function safeName(s: string, max = 60): string {
  const cleaned = s
    .replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '');
  return [...cleaned].slice(0, max).join('').trim();
}

/** 2026-10-02 */
export function ymd(iso?: string, fallback = new Date()): string {
  const d = iso ? new Date(iso) : fallback;
  const t = isNaN(d.getTime()) ? fallback : d;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

/** 没有标题的内容（推文、想法）取正文第一句：中文约 30 字，英文约 60 个字母，英文在单词边界断开 */
export function titleOf(doc: Pick<ClipDoc, 'title' | 'body'>): string {
  const t = doc.title.trim();
  if (t) return t;
  const plain = doc.body
    .replace(/\{\{media:\d+\}\}/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接/图片只留文字
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s*>.*$/gm, ' ') // 引用块不算
    .replace(/[#>*_`~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clipWidth(plain, 60) || '无标题';
}

/** 按显示宽度截断：中日韩字符算 2，其余算 1 */
export function clipWidth(s: string, max: number): string {
  let w = 0;
  let out = '';
  for (const ch of s) {
    w += /[\u2e80-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(ch) ? 2 : 1;
    if (w > max) {
      // 英文在最后一个空格处断开，避免截断单词
      const cut = out.lastIndexOf(' ');
      if (cut > max / 3 && /[A-Za-z0-9]$/.test(out)) out = out.slice(0, cut);
      return out.replace(/[\s,，、;；:：]+$/, '');
    }
    out += ch;
  }
  return out;
}

export const DEFAULT_FILENAME_TEMPLATE = '{date} {author} {title}';

/** 笔记路径（不含 .md），如 AllClip/X/2026-10-02 @karpathy 标题。文件名按模板拼：{date} {author} {title} {platform} {id} */
export function notePath(doc: ClipDoc, rootFolder: string, title = titleOf(doc), template = DEFAULT_FILENAME_TEMPLATE): string {
  const folder = `${trimSlashes(rootFolder)}/${PLATFORM_LABEL[doc.platform]}`;
  const who = doc.author.handle || (doc.platform === 'web' ? '' : doc.author.name);
  const vars: Record<string, string> = {
    date: ymd(doc.published),
    author: who ? safeName(who, 20) : '',
    title: safeName(title, 70),
    platform: PLATFORM_LABEL[doc.platform],
    id: doc.id,
  };
  const filled = (template.trim() || DEFAULT_FILENAME_TEMPLATE).replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k]! : m));
  const name = safeName(filled.replace(/\s+/g, ' '), 100);
  return `${folder}/${name || doc.id}`;
}

/** 附件路径，如 AllClip/_assets/x/1843-1.jpg */
export function assetPath(doc: ClipDoc, rootFolder: string, index: number, ext: string): string {
  return `${trimSlashes(rootFolder)}/_assets/${doc.platform}/${safeName(doc.id, 40)}-${index + 1}.${ext}`;
}

export function trimSlashes(s: string): string {
  return s.trim().replace(/^\/+|\/+$/g, '') || 'AllClip';
}
