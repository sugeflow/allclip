// 保存流程（在后台 Service Worker 里跑）：去重 → 下载媒体 → 渲染 → 写入 Vault → 记索引。
import { findSaved, markSaved } from './dedup';
import { liftImages, shortHash } from './media-md';
import type { SaveResult } from './messages';
import { isConfigured, loadSettings, type Settings } from './settings';
import type { ClipDoc, SaveOptions } from './types';
import { download, pool } from '../media/download';
import { assetPath, notePath, titleOf } from '../render/filename';
import { mergeNote, renderNote, type LocalMedia } from '../render/markdown';
import { RestError, readText, writeBinary, writeText, type RestConfig } from '../vault/rest';
import { newNoteUri, openNoteUri, withContent } from '../vault/uri';

const IMAGE_MAX = 20 * 1024 * 1024;

/** 已存过就沿用旧路径（改了标题也不会多出一篇） */
export async function resolvePath(doc: ClipDoc, settings: Settings, title?: string): Promise<string> {
  const saved = await findSaved(doc);
  return saved?.path || notePath(doc, settings.rootFolder, title?.trim() || titleOf(doc), settings.filenameTemplate);
}

export interface SaveDeps {
  /** URI 方式：把文本写进剪贴板（后台没有剪贴板，交给 offscreen 文档） */
  copyToClipboard(text: string): Promise<boolean>;
  /** 打开 obsidian:// 链接 */
  openUri(uri: string): Promise<void>;
}

const renderConfig = (s: Settings) => ({ status: s.statusValue, extraTags: s.extraTags });

/** 只存选中部分：生成一篇独立的“摘录”笔记，ID 带上选区哈希，不覆盖整篇 */
export async function excerptDoc(doc: ClipDoc, selection: string, title?: string): Promise<ClipDoc> {
  const { body, media } = liftImages(selection);
  return {
    ...doc,
    id: `${doc.id}-${await shortHash(selection)}`,
    title: `${(title?.trim() || titleOf(doc)).replace(/（摘录）$/, '')}（摘录）`,
    body,
    media,
    quoted: undefined,
    comments: undefined,
    extra: { ...doc.extra, excerpt_of: doc.url, hint: undefined },
  };
}

export async function saveDoc(
  doc: ClipDoc,
  options: SaveOptions,
  deps: SaveDeps,
  methodOverride?: 'uri',
): Promise<SaveResult> {
  if (options.selection?.trim()) {
    doc = await excerptDoc(doc, options.selection, options.title);
    options = { ...options, title: doc.title, selection: undefined, includeComments: false };
  }
  const settings = await loadSettings();
  const method = methodOverride || settings.saveMethod;
  if (method === 'rest' ? !settings.restApiKey.trim() : !isConfigured({ ...settings, saveMethod: 'uri' })) {
    return { ok: false, code: 'not-configured', error: '还没设置 Obsidian，先去设置页填一下' };
  }

  const saved = await findSaved(doc);
  const path = await resolvePath(doc, settings, options.title);
  const title = options.title?.trim() || titleOf(doc);
  const openUrl = openNoteUri(settings.vaultName, path + '.md');

  try {
    if (method === 'rest') {
      const cfg: RestConfig = { baseUrl: settings.restBaseUrl, apiKey: settings.restApiKey };
      const existing = await readText(cfg, path + '.md');
      const { local, saved: imgSaved, total } = settings.saveImagesLocal
        ? await saveMedia(doc, options, settings, cfg)
        : { local: new Map() as LocalMedia, saved: 0, total: 0 };
      let note = renderNote({ doc, options: { ...options, title }, local, config: renderConfig(settings) });
      if (existing) note = mergeNote(existing, note);
      await writeText(cfg, path + '.md', note);
      await markSaved(doc, { path, savedAt: new Date().toISOString(), title });
      if (settings.openAfterSave) await deps.openUri(openUrl);
      return { ok: true, path, images: { saved: imgSaved, total }, updated: !!existing, openUrl };
    }

    // URI：图片保留远程链接；已存过的笔记直接覆盖（URI 方式读不到旧内容，备注无法合并）
    const note = renderNote({ doc, options: { ...options, title }, local: new Map(), config: renderConfig(settings) });
    const uri = newNoteUri(settings.vaultName, path, true);
    const copied = await deps.copyToClipboard(note);
    await deps.openUri(withContent(uri, note, copied));
    await markSaved(doc, { path, savedAt: new Date().toISOString(), title });
    return { ok: true, path, images: { saved: 0, total: 0 }, updated: !!saved, openUrl };
  } catch (e) {
    if (e instanceof RestError) return { ok: false, code: e.code, error: e.message };
    return { ok: false, code: 'failed', error: (e as Error).message || String(e) };
  }
}

/** 下载图片（和勾选时的视频）写进附件文件夹；单个失败就保留远程链接，不影响整体保存 */
async function saveMedia(doc: ClipDoc, options: SaveOptions, settings: Settings, cfg: RestConfig) {
  const local: LocalMedia = new Map();
  const wantVideo = options.downloadVideo ?? settings.downloadVideoByDefault;
  const targets = doc.media
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.downloadable && (m.kind === 'image' || m.kind === 'live-photo' || wantVideo));

  await pool(targets, 4, async ({ m, i }) => {
    try {
      const max = m.kind === 'image' ? IMAGE_MAX : settings.videoMaxMB * 1024 * 1024;
      const file = await download(m, max);
      const p = assetPath(doc, settings.rootFolder, i, file.ext);
      await writeBinary(cfg, p, file.bytes, file.mime);
      local.set(i, p);
    } catch (e) {
      if (e instanceof RestError && e.code !== 'failed') throw e; // 连不上/鉴权失败要整体报错
      console.warn('[AllClip] 媒体下载失败，保留远程链接', m.url, e);
    }
  });
  return { local, saved: local.size, total: targets.length };
}
