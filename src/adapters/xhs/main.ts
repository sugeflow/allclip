// 小红书页面常驻脚本（MAIN world）：
// 1. 应答时读页面自己的状态 window.__INITIAL_STATE__.note.noteDetailMap[笔记ID]（直接打开笔记链接、或在信息流里点开笔记后都在这里）；
// 2. 备用：观察打开笔记时的 /api/sns/web/v1/feed 响应并缓存。
// 只读，不发任何请求。
import { observeJson, serveMain } from '../../core/main-bridge';
import { XHS_NS, type XhsBridgeRequest, type XhsBridgeResponse } from './bridge';

type Obj = Record<string, unknown>;

export function installXhsMain(): void {
  const w = window as unknown as { __allclipXhs?: boolean; __INITIAL_STATE__?: Obj };
  if (w.__allclipXhs) return;
  w.__allclipXhs = true;

  const fromApi = new Map<string, Obj>();
  observeJson(/\/api\/sns\/web\/v1\/feed/, (_url, json) => {
    const items = ((json as Obj)?.data as Obj | undefined)?.items;
    if (!Array.isArray(items)) return;
    for (const it of items as Obj[]) {
      const card = it.note_card as Obj | undefined;
      const id = String(it.id || card?.note_id || '');
      if (card && id) fromApi.set(id, { ...card, note_id: id });
    }
    if (fromApi.size > 200) fromApi.delete(fromApi.keys().next().value!);
  });

  serveMain<XhsBridgeRequest, XhsBridgeResponse | null>(XHS_NS, ({ id }) => {
    const entry = unref<Obj>(unref<Obj>(unref<Obj>(w.__INITIAL_STATE__)?.note)?.noteDetailMap)?.[id] as Obj | undefined;
    const note = unref<Obj>(entry?.note);
    if (note && Object.keys(note).length > 3) {
      const comments = unref<Obj>(entry?.comments)?.list;
      return { note: plain(note), comments: Array.isArray(comments) ? plain(comments.slice(0, 50)) : undefined, from: 'state' };
    }
    const api = fromApi.get(id);
    return api ? { note: plain(api), from: 'api' } : null;
  });
}

/** Vue 的 ref/reactive 取原始值 */
function unref<T>(v: unknown): T | undefined {
  if (!v || typeof v !== 'object') return v as T | undefined;
  const r = v as { _rawValue?: unknown; _value?: unknown; __v_isRef?: boolean };
  if (r.__v_isRef || '_rawValue' in r) return (r._rawValue ?? r._value) as T;
  return v as T;
}

/** 转成可以 postMessage 的普通对象；去掉体积很大的 mediaV2（几万个字段，复制会卡页面） */
function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (k, val) => (k === 'mediaV2' || k === 'mediaV2Raw' ? undefined : val)));
}
