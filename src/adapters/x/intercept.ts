// X 拦截逻辑（跑在页面 MAIN world）：页面自己请求 GraphQL 时复制一份响应，把推文按 ID 缓存。
// 只观察，不修改请求和响应，也不额外发请求。另外记录右键所在的推文，供右键菜单保存用。
import { observeJson, serveMain } from '../../core/main-bridge';
import { X_NS, type XBridgeRequest, type XBridgeResponse } from './bridge';
import { collectTweets, type RawTweet } from './raw';

export function installInterceptor(): void {
  const w = window as unknown as { __allclipX?: boolean };
  if (w.__allclipX) return;
  w.__allclipX = true;

  const MAX = 3000;
  const store = new Map<string, RawTweet>();

  observeJson(/\/i\/api\/graphql\/[^/]+\/\w+/, (_url, json) => {
    for (const t of collectTweets(json)) {
      const id = t.rest_id!;
      store.delete(id); // 重新插入，保持“最近使用”在末尾
      store.set(id, t);
    }
    while (store.size > MAX) store.delete(store.keys().next().value!);
  });

  let lastContext: { id: string; at: number } | null = null;
  document.addEventListener(
    'contextmenu',
    (e) => {
      const article = (e.target as Element | null)?.closest?.('article[data-testid="tweet"]');
      const id = article && tweetIdOf(article);
      lastContext = id ? { id, at: Date.now() } : null;
    },
    true,
  );

  serveMain<XBridgeRequest, XBridgeResponse>(X_NS, (req) => {
    const contextId = lastContext && Date.now() - lastContext.at < 8000 ? lastContext.id : undefined;
    const want = req.id || contextId;
    return { contextId, tweets: want ? related(want) : [] };
  });

  /** 目标推文 + 同一会话的推文（线程拼接要用） */
  function related(id: string): RawTweet[] {
    const focal = store.get(id);
    if (!focal) return [];
    const conv = focal.legacy?.conversation_id_str;
    const out = [focal];
    if (conv) {
      for (const t of store.values()) {
        if (t !== focal && t.legacy?.conversation_id_str === conv) out.push(t);
        if (out.length >= 400) break;
      }
    }
    return out;
  }
}

/** 推文卡片里的时间链接指向它自己的 /status/<id> */
function tweetIdOf(article: Element): string | undefined {
  const a = article.querySelector('a[href*="/status/"] time')?.closest('a');
  return a?.getAttribute('href')?.match(/\/status\/(\d+)/)?.[1];
}
