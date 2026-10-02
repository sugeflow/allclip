// 插件内部消息。popup / content script ↔ background。
import type { ClipDoc, SaveOptions } from './types';

/** 已保存记录（去重索引里的一条） */
export interface SavedEntry {
  path: string;
  savedAt: string;
  title: string;
}

/** 预览结果：弹窗用来展示卡片 */
export type PreviewResult =
  | {
      ok: true;
      doc: ClipDoc;
      /** 保存后的路径（不含 .md） */
      notePath: string;
      saved?: SavedEntry;
      configured: boolean;
      /** 页面上选中的内容（Markdown），没选就没有 */
      selection?: string;
    }
  | { ok: false; error: string; code: 'unsupported' | 'extract-failed' };

export type SaveResult =
  | { ok: true; path: string; images: { saved: number; total: number }; updated: boolean; openUrl: string }
  | { ok: false; error: string; code: 'not-configured' | 'rest-unreachable' | 'rest-auth' | 'failed' };

export type BgRequest =
  | { type: 'preview'; tabId: number }
  | { type: 'save'; tabId: number; doc: ClipDoc; options: SaveOptions; methodOverride?: 'uri' }
  | { type: 'open-in-obsidian'; url: string }
  /** 页内按钮：保存指定的内容（tabId 取发送方） */
  | { type: 'quick-save'; target?: ExtractTarget }
  | { type: 'test-rest'; baseUrl: string; apiKey: string };

/** 指定要存哪一条（例如页内按钮所在的那条推文） */
export interface ExtractTarget {
  id?: string;
}

/** background → content script */
export type ContentRequest =
  | { type: 'extract'; target?: ExtractTarget }
  | { type: 'toast'; kind: 'ok' | 'error' | 'busy'; text: string; sub?: string };

export type ExtractResponse = { ok: true; doc: ClipDoc; selection?: string } | { ok: false; error: string };

/** background → offscreen（剪贴板） */
export interface OffscreenCopy {
  target: 'offscreen';
  type: 'copy';
  text: string;
}
