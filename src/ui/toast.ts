// 页面右下角的结果提示。放在 Shadow DOM 里，不受页面样式影响，也不污染页面。

type Kind = 'ok' | 'error' | 'busy';

const CSS = `
:host { all: initial; }
.wrap {
  position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif;
  color: #1f1d1a;
}
.card {
  display: flex; align-items: center; gap: 12px;
  min-width: 240px; max-width: 380px; padding: 12px 16px 12px 12px;
  background: #fbf9f4; border: 1px solid #e3ddd0; border-radius: 10px;
  box-shadow: 0 10px 30px -12px rgba(40, 30, 10, .35);
  transform: translateY(8px); opacity: 0;
  transition: transform .22s ease, opacity .22s ease;
}
.card.show { transform: none; opacity: 1; }
.seal {
  flex: none; width: 34px; height: 34px; border-radius: 4px;
  display: grid; place-items: center;
  font: 600 15px/1 "Songti SC", "Noto Serif SC", serif; color: #fff; background: #b8432f;
}
.card.error .seal { background: #6d655a; }
.card.busy .seal { background: transparent; border: 2px solid #e3ddd0; border-top-color: #b8432f; border-radius: 50%; width: 22px; height: 22px; margin: 6px; animation: spin .8s linear infinite; }
.card.busy .seal span { display: none; }
.card.ok .seal { animation: stamp .32s cubic-bezier(.2, 1.4, .4, 1) both; }
.t { font-weight: 600; }
.s { color: #6d655a; font: 11.5px/1.4 ui-monospace, "SF Mono", Menlo, monospace; word-break: break-all; margin-top: 2px; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes stamp { from { transform: scale(1.6) rotate(-12deg); opacity: 0; } to { transform: rotate(-4deg); opacity: 1; } }
@media (prefers-color-scheme: dark) {
  .wrap { color: #ece6da; }
  .card { background: #24221e; border-color: #3a362f; }
  .s { color: #a49d90; }
  .card.busy .seal { border-color: #3a362f; border-top-color: #e0634c; }
}
@media (prefers-reduced-motion: reduce) {
  .card, .card.ok .seal { transition: none; animation: none; }
}
`;

export function mountToast() {
  const host = document.createElement('allclip-toast');
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>${CSS}</style><div class="wrap"></div>`;
  const wrap = root.querySelector('.wrap') as HTMLDivElement;
  let timer: number | undefined;

  return (kind: Kind, text: string, sub?: string) => {
    if (!host.isConnected) document.documentElement.appendChild(host);
    clearTimeout(timer);
    const glyph = kind === 'error' ? '!' : '收';
    wrap.innerHTML = '';
    const card = document.createElement('div');
    card.className = `card ${kind}`;
    card.setAttribute('role', 'status');
    card.innerHTML = `<div class="seal"><span>${glyph}</span></div><div><div class="t"></div><div class="s"></div></div>`;
    (card.querySelector('.t') as HTMLElement).textContent = text;
    (card.querySelector('.s') as HTMLElement).textContent = sub || '';
    wrap.appendChild(card);
    requestAnimationFrame(() => card.classList.add('show'));
    if (kind !== 'busy') {
      timer = window.setTimeout(() => {
        card.classList.remove('show');
        setTimeout(() => host.remove(), 250);
      }, kind === 'error' ? 6000 : 3200);
    }
  };
}
