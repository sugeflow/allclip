// 页内“收录”按钮（推文操作栏、小红书笔记互动栏）。点一下直接保存，结果在页面右下角提示。
import type { BgRequest, ExtractTarget, SaveResult } from '../core/messages';
import { loadSettings } from '../core/settings';

export const BUTTON_ATTR = 'data-allclip-btn';

const ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 4v9m0 0-3.5-3.5M12 13l3.5-3.5"/><path d="M4.5 13.5v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3.5"/></svg>';

const CSS = `
[${BUTTON_ATTR}] {
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; padding: 0; margin: 0; border: 0; border-radius: 999px;
  background: transparent; color: inherit; cursor: pointer; opacity: .85;
  transition: background .15s, color .15s, opacity .15s;
}
[${BUTTON_ATTR}]:hover { background: rgba(184, 67, 47, .12); color: #b8432f; opacity: 1; }
[${BUTTON_ATTR}][data-state="busy"] { opacity: .5; cursor: progress; }
[${BUTTON_ATTR}][data-state="done"] { color: #b8432f; opacity: 1; }
[${BUTTON_ATTR}][data-state="error"] { color: #8a8170; }
`;

let styled = false;
function ensureStyle() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.documentElement.appendChild(s);
}

export function makeButton(getTarget: () => ExtractTarget | undefined): HTMLButtonElement {
  ensureStyle();
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute(BUTTON_ATTR, '');
  btn.setAttribute('aria-label', '收录到 Obsidian');
  btn.title = '收录到 Obsidian（AllClip）';
  btn.innerHTML = ICON;
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (btn.dataset.state === 'busy' || !alive()) return;
    btn.dataset.state = 'busy';
    try {
      const res = (await chrome.runtime.sendMessage({ type: 'quick-save', target: getTarget() } satisfies BgRequest)) as SaveResult | null;
      btn.dataset.state = res?.ok ? 'done' : 'error';
      btn.title = res?.ok ? `已收录：${res.path}.md` : '没存上，看页面右下角的提示';
    } catch {
      btn.dataset.state = 'error';
    }
  });
  return btn;
}

/** 插件被重新加载后，旧页面里的脚本会失联，这时不再响应 */
export function alive(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

/** 按设置开关；设置变化时自动开/关 */
export async function whenEnabled(start: () => void, stop: () => void): Promise<void> {
  let on = false;
  const apply = async () => {
    if (!alive()) return;
    const want = (await loadSettings()).showInlineButton;
    if (want && !on) start();
    if (!want && on) stop();
    on = want;
  };
  await apply();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) void apply();
  });
}

export function removeButtons(): void {
  document.querySelectorAll(`[${BUTTON_ATTR}]`).forEach((b) => (b.closest('[data-allclip-wrap]') || b).remove());
}
