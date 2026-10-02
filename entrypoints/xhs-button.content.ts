// 小红书：在打开的笔记（浮层或详情页）的互动栏（点赞/收藏/评论）旁加一个“收录”按钮。可在设置里关掉。
import { makeButton, removeButtons, whenEnabled } from '../src/ui/inline-button';

export default defineContentScript({
  matches: ['https://www.xiaohongshu.com/*', 'https://www.rednote.com/*'],
  runAt: 'document_idle',
  main() {
    let observer: MutationObserver | null = null;
    const scan = () => {
      for (const bar of document.querySelectorAll('#noteContainer .interact-container:not([data-allclip-done]), .note-container .interact-container:not([data-allclip-done])')) {
        bar.setAttribute('data-allclip-done', '');
        const host = bar.querySelector('.left') || bar.querySelector('.buttons') || bar; // 点赞、收藏、评论那一组
        const wrap = document.createElement('span');
        wrap.setAttribute('data-allclip-wrap', '');
        wrap.style.cssText = 'display:inline-flex;align-items:center;margin-left:6px;color:#333';
        wrap.appendChild(makeButton(() => undefined)); // 存当前打开的笔记
        host.appendChild(wrap);
      }
    };
    void whenEnabled(
      () => {
        scan();
        observer = new MutationObserver(scan);
        observer.observe(document.body, { childList: true, subtree: true });
      },
      () => {
        observer?.disconnect();
        removeButtons();
        document.querySelectorAll('[data-allclip-done]').forEach((a) => a.removeAttribute('data-allclip-done'));
      },
    );
  },
});
