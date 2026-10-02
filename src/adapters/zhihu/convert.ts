// 知乎回答 / 文章 / 想法 → ClipDoc。元数据来自页面初始数据 js-initialData 或 DOM，正文 HTML 统一走 zhihuHtmlToMarkdown。
import type { ClipDoc, ClipKind, Stats } from '../../core/types';
import { zhihuHtmlToMarkdown } from './html';

export interface ZhihuInfo {
  kind: Extract<ClipKind, 'answer' | 'article' | 'pin'>;
  id: string;
  questionId?: string;
  title: string;
  html: string;
  author: { name: string; urlToken?: string; headline?: string; avatar?: string };
  created?: number | string;
  updated?: number | string;
  stats?: Stats;
  topics?: string[];
  /** 回答所属问题的描述（HTML） */
  questionDetail?: string;
  source: ClipDoc['source'];
}

export function buildZhihuDoc(info: ZhihuInfo): ClipDoc {
  const { body: content, media } = zhihuHtmlToMarkdown(info.html);
  let body = content;

  if (info.kind === 'answer' && info.questionDetail) {
    const detail = zhihuHtmlToMarkdown(info.questionDetail);
    const text = detail.body.trim();
    // 问题描述只保留文字（短的），太长的不放，原问题有链接
    if (text && text.length < 1500 && !detail.media.length) {
      body = `> [!question] 问题描述\n${text.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n')}\n\n${content}`;
    }
  }

  const url =
    info.kind === 'answer'
      ? `https://www.zhihu.com/question/${info.questionId}/answer/${info.id}`
      : info.kind === 'article'
        ? `https://zhuanlan.zhihu.com/p/${info.id}`
        : `https://www.zhihu.com/pin/${info.id}`;

  return {
    platform: 'zhihu',
    kind: info.kind,
    id: info.id,
    url,
    title: info.kind === 'pin' ? '' : info.title.trim(),
    author: {
      name: info.author.name.replace(/​/g, '').trim() || '知乎用户',
      url: info.author.urlToken ? `https://www.zhihu.com/people/${info.author.urlToken}` : undefined,
      avatar: info.author.avatar,
    },
    published: toIso(info.created),
    updated: toIso(info.updated),
    tags: info.topics || [],
    stats: info.stats,
    body,
    media,
    extra: info.author.headline ? { author_headline: info.author.headline } : undefined,
    source: info.source,
  };
}

type Obj = Record<string, any>;

/** 从 js-initialData 的 entities 里取回答 */
export function answerFromEntities(entities: Obj, answerId: string): ZhihuInfo | null {
  const a = entities?.answers?.[answerId];
  if (!a?.content) return null;
  const qid = String(a.question?.id || '');
  const q = entities?.questions?.[qid] || a.question || {};
  return {
    kind: 'answer',
    id: String(a.id || answerId),
    questionId: qid,
    title: q.title || a.question?.title || '',
    html: a.content,
    author: { name: a.author?.name || '', urlToken: a.author?.urlToken, headline: a.author?.headline, avatar: a.author?.avatarUrl },
    created: a.createdTime,
    updated: a.updatedTime,
    stats: stats({ likes: a.voteupCount, replies: a.commentCount, collects: a.favlistsCount }),
    topics: (q.topics || []).map((t: Obj) => t.name).filter(Boolean),
    questionDetail: q.detail,
    source: 'state',
  };
}

export function articleFromEntities(entities: Obj, id: string): ZhihuInfo | null {
  const a = entities?.articles?.[id];
  if (!a?.content) return null;
  return {
    kind: 'article',
    id: String(a.id || id),
    title: a.title || '',
    html: (a.titleImage ? `<p><img src="${a.titleImage}"></p>` : '') + a.content,
    author: { name: a.author?.name || '', urlToken: a.author?.urlToken, headline: a.author?.headline, avatar: a.author?.avatarUrl },
    created: a.created,
    updated: a.updated,
    stats: stats({ likes: a.voteupCount, replies: a.commentCount, collects: a.favlistsCount }),
    topics: (a.topics || []).map((t: Obj) => t.name).filter(Boolean),
    source: 'state',
  };
}

export function pinFromEntities(entities: Obj, id: string): ZhihuInfo | null {
  const p = entities?.pins?.[id];
  if (!p) return null;
  // 想法的 content 是若干块：文字（HTML）、图片、链接卡片
  const parts: string[] = [];
  for (const c of Array.isArray(p.content) ? p.content : []) {
    if (c.type === 'text') parts.push(c.content || c.ownText || '');
    else if (c.type === 'image') parts.push(`<p><img src="${c.originalUrl || c.url}"></p>`);
    else if (c.type === 'link') parts.push(`<p><a href="${c.url}">${c.title || c.url}</a></p>`);
    else if (c.type === 'video') parts.push(`<p><a class="video-box" href="${c.url || ''}">${c.title || '视频'}</a></p>`);
  }
  const author = entities?.users?.[p.author] || p.author || {};
  return {
    kind: 'pin',
    id: String(p.id || id),
    title: '',
    html: parts.join(''),
    author: { name: author.name || '', urlToken: author.urlToken, headline: author.headline, avatar: author.avatarUrl },
    created: p.created,
    updated: p.updated,
    stats: stats({ likes: p.reactionCount ?? p.likeCount, replies: p.commentCount, reposts: p.repinCount }),
    source: 'state',
  };
}

function stats(s: Record<keyof Stats, unknown> | Partial<Record<keyof Stats, unknown>>): Stats {
  const out: Stats = {};
  for (const [k, v] of Object.entries(s)) {
    const n = Number(v);
    if (v != null && v !== '' && Number.isFinite(n)) out[k as keyof Stats] = n;
  }
  return out;
}

/** 秒级时间戳 / 毫秒 / ISO 字符串 → ISO */
function toIso(v: unknown): string | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'string' && !/^\d+$/.test(v)) {
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d.toISOString().replace('.000Z', 'Z');
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return new Date(n < 1e12 ? n * 1000 : n).toISOString().replace('.000Z', 'Z');
}
