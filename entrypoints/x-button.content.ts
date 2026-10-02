// X 页面：在每条推文的操作栏（回复/转发/点赞那一排）加一个“收录”按钮。可在设置里关掉。
import { makeButton, removeButtons, whenEnabled } from '../src/ui/inline-button';

export default defineContentScript({
  matches: ['https://x.com/*', 'https://twitter.com/*'],
  runAt: 'document_idle',
  main() {
    let observer: MutationObserver | null = null;
    const scan = () => {
      for (const article of document.querySelectorAll('article[data-testid="tweet"]:not([data-allclip-done])')) {
        // 操作栏取最后一个 role=group（引用推文里没有操作栏）
        const groups = [...article.querySelectorAll('[role="group"]')].filter((g) => !g.closest('div[role="link"]'));
        const bar = groups[groups.length - 1];
        const id = tweetIdOf(article);
        if (!bar || !id) continue;
        article.setAttribute('data-allclip-done', '');
        const wrap = document.createElement('div');
        wrap.setAttribute('data-allclip-wrap', '');
        wrap.style.cssText = 'display:flex;align-items:center;color:rgb(113,118,123)';
        wrap.appendChild(makeButton(() => ({ id })));
        bar.appendChild(wrap);
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

function tweetIdOf(article: Element): string | undefined {
  const links = [...article.querySelectorAll('a[href*="/status/"]')].filter((a) => a.querySelector('time') && !a.closest('div[role="link"]'));
  return links[0]?.getAttribute('href')?.match(/\/status\/(\d+)/)?.[1];
}
