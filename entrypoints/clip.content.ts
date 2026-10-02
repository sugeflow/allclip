// 按需注入的内容脚本：负责抓取当前页 + 在页面右下角显示保存结果。
// 不常驻（registration: runtime），只在用户点保存时由后台注入，只需 activeTab 权限。
import { extractCurrentPage } from '../src/adapters/registry';
import type { ContentRequest, ExtractResponse } from '../src/core/messages';
import { htmlToMarkdown } from '../src/core/html-md';
import { mountToast } from '../src/ui/toast';

export default defineContentScript({
  registration: 'runtime',
  main() {
    const w = window as unknown as { __allclip?: boolean };
    if (w.__allclip) return;
    w.__allclip = true;

    const toast = mountToast();

    chrome.runtime.onMessage.addListener((msg: ContentRequest, _sender, sendResponse) => {
      if (msg.type === 'extract') {
        extractCurrentPage(msg.target)
          .then((doc): ExtractResponse => ({ ok: true, doc, selection: selectionMarkdown() }))
          .catch((e): ExtractResponse => ({ ok: false, error: String(e?.message || e) }))
          .then(sendResponse);
        return true;
      }
      if (msg.type === 'toast') {
        toast(msg.kind, msg.text, msg.sub);
        sendResponse(true);
      }
    });
  },
});

/** 页面上选中的内容转成 Markdown；没选或只选了几个字时返回 undefined */
function selectionMarkdown(): string | undefined {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return undefined;
  if (sel.toString().trim().length < 2) return undefined;
  const box = document.createElement('div');
  for (let i = 0; i < sel.rangeCount; i++) box.appendChild(sel.getRangeAt(i).cloneContents());
  // 相对地址的图片和链接补成绝对地址
  box.querySelectorAll('img[src]').forEach((img) => img.setAttribute('src', (img as HTMLImageElement).src));
  box.querySelectorAll('a[href]').forEach((a) => a.setAttribute('href', (a as HTMLAnchorElement).href));
  const md = htmlToMarkdown(box);
  return md || undefined;
}
