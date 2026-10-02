// 知乎适配器：回答 / 专栏文章 / 想法。
// 正文两个来源都取：页面初始数据 js-initialData 和已渲染的 DOM，用更长的那份（初始数据有时会截断长文；
// 在站内点来点去时初始数据又不会更新）——这是 download-zhihu 的经验。不调用知乎接口。
import { contextItem } from '../../core/context-mark';
import type { ClipDoc } from '../../core/types';
import { AdapterError } from '../errors';
import type { Adapter } from '../registry';
import { answerFromEntities, articleFromEntities, buildZhihuDoc, pinFromEntities, type ZhihuInfo } from './convert';
import { ZHIHU_ITEM as ITEM_SEL } from './selectors';

type Obj = Record<string, any>;

export const zhihuAdapter: Adapter = {
  platform: 'zhihu',
  match: (url) => /(^|\.)zhihu\.com$/.test(url.hostname),
  async extract(): Promise<ClipDoc | null> {
    const entities = initialEntities();
    const path = location.pathname;

    if (location.hostname === 'zhuanlan.zhihu.com' && /^\/p\/\d+/.test(path)) {
      const id = path.match(/^\/p\/(\d+)/)![1]!;
      return pick(articleFromEntities(entities, id), articleFromDom(id));
    }
    const pinId = path.match(/^\/pin\/(\d+)/)?.[1];
    if (pinId) return pick(pinFromEntities(entities, pinId), pinFromDom(pinId));

    // 回答：刚右键过的那条 > 地址里指定的 > 屏幕中间正在看的那条（问题页、首页信息流都适用）
    const ctx = contextItem(ITEM_SEL);
    const urlAnswer = ctx ? undefined : path.match(/\/answer\/(\d+)/)?.[1];
    const item = ctx || (urlAnswer ? findItem('Answer', urlAnswer) : itemInView());
    const type = item ? itemMeta(item)?.type : 'Answer';
    const id = urlAnswer || (item && itemMeta(item)?.token);
    if (id && type === 'Answer') {
      if (item && isCollapsed(item) && !entities?.answers?.[id]?.content) {
        throw new AdapterError('这条回答还没展开，先点“阅读全文”再保存');
      }
      return pick(answerFromEntities(entities, id), item ? answerFromDom(item, id) : null);
    }
    if (id && type === 'Post' && item) return pick(articleFromEntities(entities, id), articleFromItem(item, id));
    if (/^\/question\/\d+/.test(path)) throw new AdapterError('把想保存的回答滚动到屏幕中间，再保存');
    return null; // 其它页面交给通用模式
  },
};

/** 两个来源取正文更长的；元数据以初始数据为准，缺的用 DOM 补 */
function pick(state: ZhihuInfo | null, dom: ZhihuInfo | null): ClipDoc | null {
  if (!state && !dom) return null;
  if (!state) return buildZhihuDoc(dom!);
  if (!dom) return buildZhihuDoc(state);
  const useDom = textLen(dom.html) > textLen(state.html);
  return buildZhihuDoc({ ...state, html: useDom ? dom.html : state.html, source: useDom ? 'dom' : 'state' });
}

const textLen = (html: string) => html.replace(/<[^>]+>/g, '').length;

function initialEntities(): Obj {
  try {
    const raw = document.querySelector('script#js-initialData')?.textContent;
    return raw ? JSON.parse(raw)?.initialState?.entities || {} : {};
  } catch {
    return {};
  }
}

// ---------- DOM ----------

/** 卡片上的 data-za-extra-module 带着类型和 ID：{"card":{"content":{"type":"Answer","token":"123"}}} */
function itemMeta(el: Element): { type: string; token: string } | null {
  try {
    const c = JSON.parse(el.getAttribute('data-za-extra-module') || '{}')?.card?.content;
    return c?.token ? { type: c.type, token: String(c.token) } : null;
  } catch {
    return null;
  }
}

function findItem(type: string, id: string): Element | null {
  return (
    [...document.querySelectorAll(ITEM_SEL)].find((el) => {
      const m = itemMeta(el);
      return m?.type === type && m.token === id;
    }) || null
  );
}

/** 屏幕中线穿过的那张卡片；没有就取离中线最近的 */
function itemInView(): Element | null {
  const mid = window.innerHeight / 2;
  let best: Element | null = null;
  let bestDist = Infinity;
  for (const el of document.querySelectorAll(ITEM_SEL)) {
    if (!itemMeta(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height === 0) continue;
    const dist = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
    if (dist < bestDist) {
      best = el;
      bestDist = dist;
    }
  }
  return bestDist < window.innerHeight ? best : null;
}

function isCollapsed(item: Element): boolean {
  const more = item.querySelector('.ContentItem-more, .ContentItem-expandButton');
  return !!more && (more as HTMLElement).offsetParent !== null;
}

const meta = (scope: ParentNode, prop: string) => (scope.querySelector(`meta[itemprop="${prop}"]`) as HTMLMetaElement | null)?.content || '';

function authorFrom(scope: Element) {
  const box = scope.querySelector('.AuthorInfo') || scope;
  const url = meta(box, 'url');
  return {
    name: meta(box, 'name') || box.querySelector('.AuthorInfo-name')?.textContent?.trim() || '',
    urlToken: url.match(/\/people\/([^/?#]+)/)?.[1],
    headline: box.querySelector('.AuthorInfo-badgeText')?.textContent?.trim(),
  };
}

function answerFromDom(item: Element, id: string): ZhihuInfo | null {
  const rich = item.querySelector('.RichContent-inner .RichText, .RichText.ztext');
  if (!rich) return null;
  const qid =
    location.pathname.match(/\/question\/(\d+)/)?.[1] ||
    item.querySelector('a[href*="/question/"]')?.getAttribute('href')?.match(/\/question\/(\d+)/)?.[1] ||
    '';
  return {
    kind: 'answer',
    id,
    questionId: qid,
    title:
      document.querySelector('.QuestionHeader-title')?.textContent?.trim() ||
      item.querySelector('.ContentItem-title')?.textContent?.trim() ||
      '',
    html: rich.innerHTML,
    author: authorFrom(item),
    created: meta(item, 'dateCreated'),
    updated: meta(item, 'dateModified'),
    stats: numStats({ likes: meta(item, 'upvoteCount'), replies: meta(item, 'commentCount') }),
    topics: [...document.querySelectorAll('.QuestionHeader-topics .Tag')].map((t) => t.textContent?.trim() || '').filter(Boolean),
    source: 'dom',
  };
}

function articleFromDom(id: string): ZhihuInfo | null {
  const rich = document.querySelector('.Post-RichTextContainer .RichText, article .Post-RichText, .Post-RichText');
  if (!rich) return null;
  const header = document.querySelector('.Post-Header') || document.body;
  const cover = document.querySelector('.TitleImage') as HTMLImageElement | null;
  return {
    kind: 'article',
    id,
    title: document.querySelector('.Post-Title')?.textContent?.trim() || document.title.replace(/ - 知乎$/, ''),
    html: (cover?.src ? `<p><img src="${cover.src}"></p>` : '') + rich.innerHTML,
    author: authorFrom(header),
    created: meta(document, 'datePublished') || (document.querySelector('.ContentItem-time')?.textContent || '').match(/\d{4}-\d{2}-\d{2}/)?.[0],
    topics: [...document.querySelectorAll('.Post-topicsAndReviewer .Tag, .TopicList .Tag')].map((t) => t.textContent?.trim() || '').filter(Boolean),
    source: 'dom',
  };
}

function articleFromItem(item: Element, id: string): ZhihuInfo | null {
  const rich = item.querySelector('.RichContent-inner .RichText, .RichText.ztext');
  if (!rich) return null;
  return {
    kind: 'article',
    id,
    title: item.querySelector('.ContentItem-title')?.textContent?.trim() || '',
    html: rich.innerHTML,
    author: authorFrom(item),
    created: meta(item, 'datePublished'),
    source: 'dom',
  };
}

function pinFromDom(id: string): ZhihuInfo | null {
  const item = document.querySelector('.PinItem') || document.querySelector('.ContentItem');
  const rich = item?.querySelector('.RichContent-inner, .PinItem-content');
  if (!item || !rich) return null;
  return {
    kind: 'pin',
    id,
    title: '',
    html: rich.innerHTML,
    author: authorFrom(item),
    created: meta(item, 'dateCreated'),
    source: 'dom',
  };
}

function numStats(s: Record<string, string>) {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(s)) if (v && Number.isFinite(Number(v))) out[k] = Number(v);
  return out;
}
