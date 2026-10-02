// X GraphQL 推文 → ClipDoc。纯函数，不碰 DOM 和 chrome API，方便用真实响应做测试。
import { mediaToken, type ClipDoc, type MediaItem, type Stats } from '../../core/types';
import { articleToMarkdown } from './article';
import { unwrap, type RawEntities, type RawMedia, type RawTweet, type RawUser } from './raw';

const MAX_THREAD = 100;

export function buildXDoc(focalId: string, pool: RawTweet[]): ClipDoc | null {
  const byId = new Map<string, RawTweet>();
  for (const raw of pool) {
    const t = unwrap(raw);
    if (t?.rest_id) byId.set(t.rest_id, t);
  }
  let focal = byId.get(focalId);
  if (!focal) return null;
  // 时间线里的转发：内容在被转发的那条里
  const rt = unwrap(focal.legacy?.retweeted_status_result?.result);
  if (rt) {
    focal = rt;
    byId.set(rt.rest_id!, rt);
  }

  const chain = threadOf(focal, byId);
  const root = chain[0]!;
  const user = userOf(root);
  const media: MediaItem[] = [];
  const tags = new Set<string>();

  const article = unwrap(root)?.article?.article_results?.result;
  let body: string;
  let title = '';
  let kind: ClipDoc['kind'] = chain.length > 1 ? 'thread' : 'post';

  if (article && (article.content_state?.blocks?.length || article.title)) {
    kind = 'article';
    title = (article.title || '').trim();
    body = articleToMarkdown(article, media);
  } else {
    body = chain.map((t) => tweetBlock(t, media, tags, true)).join('\n\n---\n\n');
  }

  return {
    platform: 'x',
    kind,
    id: root.rest_id!,
    url: `https://x.com/${user.handle?.slice(1) || 'i'}/status/${root.rest_id}`,
    title,
    author: user,
    published: toIso(root.legacy?.created_at),
    lang: root.legacy?.lang && root.legacy.lang !== 'zxx' && root.legacy.lang !== 'und' ? root.legacy.lang : undefined,
    tags: [...tags],
    stats: statsOf(root),
    body,
    media,
    extra: chain.length > 1 ? { thread_length: chain.length } : undefined,
    source: 'intercept',
  };
}

/** 线程：沿“回复给同一作者”向上找到串首，再向下接上作者的连续自回复 */
export function threadOf(focal: RawTweet, byId: Map<string, RawTweet>): RawTweet[] {
  const author = focal.legacy?.user_id_str;
  const chain = [focal];
  let cur = focal;
  while (chain.length < MAX_THREAD) {
    const parent = byId.get(cur.legacy?.in_reply_to_status_id_str || '');
    if (!parent || parent.legacy?.user_id_str !== author) break;
    chain.unshift(parent);
    cur = parent;
  }
  cur = focal;
  while (chain.length < MAX_THREAD) {
    let next: RawTweet | undefined;
    for (const t of byId.values()) {
      if (t.legacy?.in_reply_to_status_id_str !== cur.rest_id || t.legacy?.user_id_str !== author) continue;
      if (!next || BigInt(t.rest_id!) < BigInt(next.rest_id!)) next = t; // 作者多次自回复时取最早那条
    }
    if (!next) break;
    chain.push(next);
    cur = next;
  }
  return chain;
}

/** 一条推文 → Markdown（正文 + 媒体占位符 + 投票 + 引用） */
function tweetBlock(t: RawTweet, media: MediaItem[], tags: Set<string>, withQuote: boolean): string {
  const parts: string[] = [];
  const text = tweetText(t);
  if (text) parts.push(text);

  for (const h of (t.note_tweet?.note_tweet_results?.result?.entity_set ?? t.legacy?.entities)?.hashtags || []) {
    if (h.text) tags.add(h.text);
  }

  const poll = pollOf(t);
  if (poll) parts.push(poll);

  const tokens = mediaOf(t).map((m) => {
    media.push(m);
    return mediaToken(media.length - 1);
  });
  if (tokens.length) parts.push(tokens.join('\n'));

  const quoted = withQuote ? unwrap(t.quoted_status_result?.result) : null;
  if (quoted) parts.push(quoteBlock(quoted, media, tags));
  else if (withQuote && t.legacy?.is_quote_status && t.legacy.quoted_status_permalink?.expanded) {
    parts.push(`> [!quote] 引用的推文\n> ${t.legacy.quoted_status_permalink.expanded}`);
  }
  return parts.join('\n\n');
}

function quoteBlock(q: RawTweet, media: MediaItem[], tags: Set<string>): string {
  const u = userOf(q);
  const url = `https://x.com/${u.handle?.slice(1) || 'i'}/status/${q.rest_id}`;
  const date = toIso(q.legacy?.created_at)?.slice(0, 10);
  const head = `[!quote] 引用 [${u.name}${u.handle ? ` ${u.handle}` : ''}](${url})${date ? ` · ${date}` : ''}`;
  const inner = tweetBlock(q, media, tags, false);
  return [head, ...inner.split('\n')].map((l) => (l ? `> ${l}` : '>')).join('\n');
}

// ---------- 正文 ----------

/**
 * 推文文字：长推文用 note_tweet；按 display_text_range 去掉开头的 @回复对象 和结尾的媒体链接；
 * t.co 短链换成真实地址（数据里自带 expanded_url，不需要联网解析）。
 * 下标按 Unicode 码位计算（X 的约定），所以先 Array.from。
 */
export function tweetText(t: RawTweet): string {
  const note = t.note_tweet?.note_tweet_results?.result;
  const raw = note?.text ?? t.legacy?.full_text ?? '';
  const entities: RawEntities = (note ? note.entity_set : t.legacy?.entities) || {};
  const chars = Array.from(raw);
  const [start, end] = note ? [0, chars.length] : (t.legacy?.display_text_range ?? [0, chars.length]);

  // 链接卡片（YouTube、文章等）有标题时，用标题当链接文字，比截断的 display_url 好读
  const cardVal = (k: string) => t.card?.legacy?.binding_values?.find((b) => b.key === k)?.value?.string_value;
  const cardUrl = cardVal('card_url');
  const cardTitle = cardVal('title');
  const quoteUrl = t.legacy?.quoted_status_permalink?.url;
  const quoteExpanded = t.legacy?.quoted_status_permalink?.expanded?.toLowerCase();
  const repl: { s: number; e: number; text: string }[] = [];
  for (const u of entities.urls || []) {
    if (!u.indices) continue;
    const isQuoteLink =
      (quoteUrl && u.url === quoteUrl) || (quoteExpanded && u.expanded_url?.toLowerCase() === quoteExpanded);
    const href = u.expanded_url || u.url || '';
    const label = cardTitle && cardUrl && u.url === cardUrl ? cardTitle : u.display_url || href;
    repl.push({ s: u.indices[0], e: u.indices[1], text: isQuoteLink ? '' : `[${label.replace(/[[\]]/g, '')}](${href})` });
  }
  for (const m of entities.media || []) if (m.indices) repl.push({ s: m.indices[0], e: m.indices[1], text: '' });
  repl.sort((a, b) => a.s - b.s);

  let out = '';
  let i = start;
  for (const r of repl) {
    if (r.s < i || r.s >= end) continue;
    out += chars.slice(i, r.s).join('') + r.text;
    i = Math.min(r.e, end);
  }
  out += chars.slice(i, end).join('');
  if (!note) out = unescapeHtml(out);
  return escapeMd(out.trim());
}

function unescapeHtml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

/** 只转义会被 Obsidian 误当成格式的行首符号（标题、引用块），其余保持原样 */
function escapeMd(s: string): string {
  return s
    .split('\n')
    .map((l) => l.replace(/^(#{1,6}\s)/, '\\$1').replace(/^>/, '\\>'))
    .join('\n');
}

// ---------- 媒体 ----------

export function mediaOf(t: RawTweet): MediaItem[] {
  const list: RawMedia[] = t.legacy?.extended_entities?.media || (t.legacy?.entities?.media as RawMedia[] | undefined) || [];
  const out: MediaItem[] = [];
  for (const m of list) {
    const base = m.media_url_https;
    if (!base) continue;
    const size = { width: m.original_info?.width, height: m.original_info?.height };
    if (m.type === 'photo') {
      out.push({ kind: 'image', url: origImage(base), alt: m.ext_alt_text || undefined, downloadable: true, ...size });
    } else if (m.type === 'video' || m.type === 'animated_gif') {
      const mp4s = (m.video_info?.variants || [])
        .filter((v) => v.content_type === 'video/mp4' && v.url)
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
        .map((v) => ({ url: v.url!, bitrate: v.bitrate }));
      out.push({
        kind: m.type === 'video' ? 'video' : 'gif',
        url: mp4s[0]?.url || base,
        poster: origImage(base),
        alt: m.ext_alt_text || undefined,
        downloadable: mp4s.length > 0,
        variants: mp4s.length > 1 ? mp4s : undefined,
        durationMs: m.video_info?.duration_millis,
        ...size,
      });
    }
  }
  return out;
}

/** pbs.twimg.com/media/abc.jpg → 原图 */
export function origImage(u: string): string {
  try {
    const url = new URL(u);
    if (url.hostname !== 'pbs.twimg.com') return u;
    url.searchParams.set('name', 'orig');
    return url.toString();
  } catch {
    return u;
  }
}

// ---------- 投票 ----------

function pollOf(t: RawTweet): string {
  const card = t.card?.legacy;
  if (!card?.name || !/^poll\d+choice/.test(card.name)) return '';
  const val = (k: string) => card.binding_values?.find((b) => b.key === k)?.value?.string_value;
  const rows: string[] = [];
  let total = 0;
  const choices: { label: string; count: number }[] = [];
  for (let i = 1; i <= 4; i++) {
    const label = val(`choice${i}_label`);
    if (!label) continue;
    const count = Number(val(`choice${i}_count`) || 0);
    total += count;
    choices.push({ label, count });
  }
  if (!choices.length) return '';
  rows.push('**投票**');
  for (const c of choices) {
    const pct = total ? ` · ${Math.round((c.count / total) * 100)}%` : '';
    rows.push(`- ${c.label} — ${c.count} 票${pct}`);
  }
  return rows.join('\n');
}

// ---------- 作者 / 数据 / 时间 ----------

export function userOf(t: RawTweet): ClipDoc['author'] {
  const u: RawUser | undefined = t.core?.user_results?.result;
  const handle = u?.core?.screen_name || u?.legacy?.screen_name || '';
  const name = u?.core?.name || u?.legacy?.name || handle;
  return {
    name,
    handle: handle ? `@${handle}` : undefined,
    url: handle ? `https://x.com/${handle}` : undefined,
    avatar: (u?.avatar?.image_url || u?.legacy?.profile_image_url_https || '').replace('_normal.', '_400x400.') || undefined,
  };
}

function statsOf(t: RawTweet): Stats {
  const l = t.legacy || {};
  const s: Stats = {};
  if (l.favorite_count != null) s.likes = l.favorite_count;
  if (l.retweet_count != null) s.reposts = l.retweet_count;
  if (l.reply_count != null) s.replies = l.reply_count;
  if (l.bookmark_count != null) s.bookmarks = l.bookmark_count;
  const views = Number(t.views?.count);
  if (Number.isFinite(views) && views > 0) s.views = views;
  return s;
}

/** "Tue Mar 21 20:50:14 +0000 2006" → ISO */
export function toIso(s?: string): string | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().replace('.000Z', 'Z');
  const m = s.match(/^\w{3} (\w{3}) (\d{2}) (\d{2}:\d{2}:\d{2}) \+0000 (\d{4})$/);
  if (!m) return undefined;
  const d2 = new Date(`${m[1]} ${m[2]} ${m[4]} ${m[3]} UTC`);
  return isNaN(d2.getTime()) ? undefined : d2.toISOString().replace('.000Z', 'Z');
}
