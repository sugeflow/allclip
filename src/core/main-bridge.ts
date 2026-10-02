// 页面 MAIN world（常驻小脚本，能读页面自己的 JS 数据）与抓取脚本（ISOLATED world，按需注入）之间的通信。
// 两边在同一个窗口里，用 window.postMessage 传消息，带固定标记和命名空间；只接受同窗口、同源的消息。

const REQ = 'allclip:req';
const RES = 'allclip:res';

interface Req<P> {
  source: typeof REQ;
  ns: string;
  reqId: string;
  payload: P;
}
interface Res<R> {
  source: typeof RES;
  ns: string;
  reqId: string;
  result: R;
}

/** MAIN world 一侧：注册应答函数 */
export function serveMain<P, R>(ns: string, handler: (payload: P) => R): void {
  window.addEventListener('message', (e) => {
    const req = e.data as Req<P>;
    if (e.source !== window || req?.source !== REQ || req.ns !== ns) return;
    let result: R | null = null;
    try {
      result = handler(req.payload);
    } catch (err) {
      console.warn('[AllClip]', ns, err);
    }
    window.postMessage({ source: RES, ns, reqId: req.reqId, result } satisfies Res<R | null>, location.origin);
  });
}

/** 抓取脚本一侧：发请求；页面脚本不在（例如插件装好后页面没刷新）时超时返回 null */
export function askMain<P, R>(ns: string, payload: P, timeoutMs = 400): Promise<R | null> {
  return new Promise((resolve) => {
    const reqId = Math.random().toString(36).slice(2);
    const onMsg = (e: MessageEvent) => {
      const d = e.data as Res<R>;
      if (e.source !== window || d?.source !== RES || d.ns !== ns || d.reqId !== reqId) return;
      window.removeEventListener('message', onMsg);
      clearTimeout(timer);
      resolve(d.result ?? null);
    };
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMsg);
      resolve(null);
    }, timeoutMs);
    window.addEventListener('message', onMsg);
    window.postMessage({ source: REQ, ns, reqId, payload } satisfies Req<P>, location.origin);
  });
}

/** 在页面里 hook fetch 和 XHR，url 命中时把 JSON 响应交给 onJson。只观察，不改请求和响应。 */
export function observeJson(match: RegExp, onJson: (url: string, json: unknown) => void): void {
  const origFetch = window.fetch;
  window.fetch = async function (this: unknown, ...args: Parameters<typeof fetch>) {
    const res = await origFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0] instanceof URL ? args[0].href : args[0].url;
      if (match.test(url) && res.ok) res.clone().json().then((j) => onJson(url, j), () => {});
    } catch {
      /* ignore */
    }
    return res;
  } as typeof fetch;

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]) {
    const url = String(args[1] ?? '');
    if (match.test(url)) {
      this.addEventListener('load', () => {
        try {
          if (this.status !== 200) return;
          if (this.responseType === '' || this.responseType === 'text') onJson(url, JSON.parse(this.responseText));
          else if (this.responseType === 'json') onJson(url, this.response);
        } catch {
          /* ignore */
        }
      });
    }
    return (origOpen as (...a: unknown[]) => void).apply(this, args);
  } as typeof XMLHttpRequest.prototype.open;
}
