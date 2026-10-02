// 后台：快捷键、右键菜单、消息路由；按需把内容脚本注入当前页（只需 activeTab 权限）。
import { findSaved } from '../src/core/dedup';
import type { BgRequest, ContentRequest, ExtractResponse, ExtractTarget, OffscreenCopy, PreviewResult, SaveResult } from '../src/core/messages';
import { resolvePath, saveDoc, type SaveDeps } from '../src/core/pipeline';
import { isConfigured, loadSettings } from '../src/core/settings';
import type { ClipDoc, SaveOptions } from '../src/core/types';
import { testConnection } from '../src/vault/rest';

const MENU_ID = 'allclip-save';

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(async (details) => {
    chrome.contextMenus.create({ id: MENU_ID, title: '保存到 AllClip', contexts: ['page', 'selection', 'link', 'image'] });
    if (details.reason === 'install') chrome.runtime.openOptionsPage();
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === MENU_ID && tab?.id != null) void quickSave(tab.id);
  });

  chrome.commands.onCommand.addListener(async (command, tab) => {
    if (command !== 'quick-save') return;
    const id = tab?.id ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    if (id != null) void quickSave(id);
  });

  chrome.runtime.onMessage.addListener((msg: BgRequest | OffscreenCopy, sender, sendResponse) => {
    if ((msg as OffscreenCopy).target === 'offscreen') return; // 发给 offscreen 的消息
    const req = msg as BgRequest;
    if (req.type === 'quick-save') {
      // 页内按钮：存发送方所在的标签页
      const tabId = sender.tab?.id;
      if (tabId == null) return;
      quickSave(tabId, req.target).then(sendResponse, () => sendResponse({ ok: false }));
      return true;
    }
    handle(req).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  });
});

async function handle(msg: BgRequest): Promise<unknown> {
  switch (msg.type) {
    case 'preview':
      return preview(msg.tabId);
    case 'save':
      return saveDoc(msg.doc, msg.options, deps(msg.tabId), msg.methodOverride);
    case 'open-in-obsidian':
      return openUri(msg.url);
    case 'test-rest':
      return testConnection({ baseUrl: msg.baseUrl, apiKey: msg.apiKey });
    case 'quick-save':
      return null; // 在 onMessage 里单独处理（需要发送方的 tabId）
  }
}

// ---------- 内容脚本 ----------

async function ensureContentScript(tabId: number): Promise<void> {
  const [probe] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => !!(window as unknown as { __allclip?: boolean }).__allclip,
  });
  if (!probe?.result) await chrome.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/clip.js'] });
}

async function sendToTab<T>(tabId: number, msg: ContentRequest): Promise<T> {
  return chrome.tabs.sendMessage(tabId, msg) as Promise<T>;
}

async function extract(tabId: number, target?: ExtractTarget): Promise<ExtractResponse | { ok: false; error: string; unsupported: true }> {
  try {
    await ensureContentScript(tabId);
  } catch {
    return { ok: false, error: '这个页面不能保存（浏览器内置页面或扩展商店）', unsupported: true };
  }
  return sendToTab<ExtractResponse>(tabId, { type: 'extract', target });
}

async function preview(tabId: number): Promise<PreviewResult> {
  const r = await extract(tabId);
  if (!r.ok) return { ok: false, error: r.error, code: 'unsupported' in r ? 'unsupported' : 'extract-failed' };
  const settings = await loadSettings();
  return {
    ok: true,
    doc: r.doc,
    notePath: await resolvePath(r.doc, settings),
    saved: await findSaved(r.doc),
    configured: isConfigured(settings),
    selection: r.selection,
  };
}

async function toast(tabId: number, kind: 'ok' | 'error' | 'busy', text: string, sub?: string) {
  await sendToTab(tabId, { type: 'toast', kind, text, sub }).catch(() => {});
}

/** 快捷键 / 右键：不打开弹窗，直接保存，在页面右下角提示结果 */
async function quickSave(tabId: number, target?: ExtractTarget): Promise<SaveResult | null> {
  const r = await extract(tabId, target);
  if (!r.ok) {
    if (!('unsupported' in r)) await toast(tabId, 'error', '没抓到内容', r.error);
    return null;
  }
  const settings = await loadSettings();
  if (!isConfigured(settings)) {
    await toast(tabId, 'error', '还没设置 Obsidian', '已打开设置页');
    chrome.runtime.openOptionsPage();
    return null;
  }
  await toast(tabId, 'busy', '正在收录…');
  const doc: ClipDoc = r.doc;
  const options: SaveOptions = {
    includeComments: doc.platform === 'reddit' && settings.redditTopComments > 0,
  };
  const res: SaveResult = await saveDoc(doc, options, deps(tabId));
  if (res.ok) {
    const img = res.images.total ? ` · 图片 ${res.images.saved}/${res.images.total}` : '';
    await toast(tabId, 'ok', res.updated ? '已更新' : '已收录', res.path + '.md' + img);
  } else {
    await toast(tabId, 'error', '保存失败', res.error);
  }
  return res;
}

// ---------- Obsidian URI 与剪贴板 ----------

function deps(tabId: number): SaveDeps {
  return { copyToClipboard, openUri: (u) => openUri(u, tabId) };
}

/** 在当前标签页打开 obsidian:// —— 外部协议不会让页面跳走（官方剪藏同款做法） */
async function openUri(url: string, tabId?: number): Promise<void> {
  const id = tabId ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (id != null) await chrome.tabs.update(id, { url });
  else await chrome.tabs.create({ url });
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const has = await chrome.offscreen.hasDocument();
    if (!has) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: [chrome.offscreen.Reason.CLIPBOARD],
        justification: '把笔记内容放进剪贴板，交给 Obsidian 读取',
      });
    }
    const msg: OffscreenCopy = { target: 'offscreen', type: 'copy', text };
    return (await chrome.runtime.sendMessage(msg)) === true;
  } catch (e) {
    console.warn('[AllClip] 剪贴板写入失败', e);
    return false;
  }
}
