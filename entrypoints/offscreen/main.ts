// 后台 Service Worker 没有剪贴板，借 offscreen 文档的 execCommand('copy') 写入。
import type { OffscreenCopy } from '../../src/core/messages';

chrome.runtime.onMessage.addListener((msg: OffscreenCopy, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen' || msg.type !== 'copy') return;
  const buf = document.getElementById('buf') as HTMLTextAreaElement;
  buf.value = msg.text;
  buf.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  buf.value = '';
  sendResponse(ok);
});
