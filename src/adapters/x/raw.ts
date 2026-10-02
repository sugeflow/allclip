// X GraphQL 原始数据里我们会读到的字段（只列用到的子集，全部可选，读取时一律防御）。
// 字段路径以 2026-10 实际抓到的 TweetDetail 响应为准：用户名在 core.user_results.result.core，
// 旧版在 .legacy，两处都读。

export interface RawUser {
  rest_id?: string;
  core?: { name?: string; screen_name?: string };
  legacy?: { name?: string; screen_name?: string; profile_image_url_https?: string };
  avatar?: { image_url?: string };
}

export interface RawUrlEntity {
  url?: string;
  expanded_url?: string;
  display_url?: string;
  indices?: [number, number];
}

export interface RawEntities {
  urls?: RawUrlEntity[];
  media?: RawUrlEntity[];
  hashtags?: { text?: string; indices?: [number, number] }[];
  user_mentions?: { screen_name?: string; indices?: [number, number] }[];
}

export interface RawVariant {
  bitrate?: number;
  content_type?: string;
  url?: string;
}

export interface RawMedia {
  type?: 'photo' | 'video' | 'animated_gif' | string;
  media_url_https?: string;
  ext_alt_text?: string | null;
  url?: string;
  original_info?: { width?: number; height?: number };
  video_info?: { variants?: RawVariant[]; duration_millis?: number };
}

export interface RawBinding {
  key?: string;
  value?: { string_value?: string; type?: string; image_value?: { url?: string } };
}

export interface RawTweet {
  __typename?: string;
  rest_id?: string;
  tweet?: RawTweet; // TweetWithVisibilityResults 包了一层
  core?: { user_results?: { result?: RawUser } };
  legacy?: {
    full_text?: string;
    created_at?: string;
    conversation_id_str?: string;
    in_reply_to_status_id_str?: string;
    user_id_str?: string;
    lang?: string;
    display_text_range?: [number, number];
    entities?: RawEntities;
    extended_entities?: { media?: RawMedia[] };
    favorite_count?: number;
    retweet_count?: number;
    reply_count?: number;
    quote_count?: number;
    bookmark_count?: number;
    is_quote_status?: boolean;
    quoted_status_permalink?: { url?: string; expanded?: string };
    retweeted_status_result?: { result?: RawTweet };
  };
  note_tweet?: {
    note_tweet_results?: { result?: { text?: string; entity_set?: RawEntities } };
  };
  quoted_status_result?: { result?: RawTweet };
  views?: { count?: string };
  card?: { legacy?: { name?: string; binding_values?: RawBinding[] } };
  article?: { article_results?: { result?: RawArticle } };
}

export interface RawArticle {
  rest_id?: string;
  title?: string;
  preview_text?: string;
  cover_media?: { media_info?: { original_img_url?: string } };
  content_state?: {
    blocks?: DraftBlock[];
    entityMap?: Record<string, DraftEntity> | { key?: string; value?: DraftEntity }[];
  };
  media_entities?: { media_id?: string; media_key?: string; media_info?: { original_img_url?: string; __typename?: string; variants?: RawVariant[] } }[];
}

export interface DraftBlock {
  key?: string;
  type?: string;
  text?: string;
  depth?: number;
  inlineStyleRanges?: { offset: number; length: number; style: string }[];
  entityRanges?: { offset: number; length: number; key: number | string }[];
  data?: Record<string, unknown>;
}

export interface DraftEntity {
  type?: string;
  mutability?: string;
  data?: Record<string, unknown> & {
    url?: string;
    markdown?: string;
    mediaItems?: { mediaId?: string; media_id?: string; localMediaId?: string }[];
    tweetId?: string;
  };
}

/** 去掉 TweetWithVisibilityResults 外壳；墓碑/不可见返回 null */
export function unwrap(t: RawTweet | undefined | null): RawTweet | null {
  if (!t) return null;
  if (t.__typename === 'TweetWithVisibilityResults' && t.tweet) return unwrap(t.tweet);
  if (t.__typename === 'TweetTombstone' || t.__typename === 'TweetUnavailable') return null;
  return t.rest_id && t.legacy ? t : null;
}

/** 判断一个对象是不是推文（用于在任意 GraphQL 响应里搜集推文） */
export function isTweet(o: unknown): o is RawTweet {
  const t = o as RawTweet;
  return !!t && typeof t.rest_id === 'string' && !!t.legacy && (t.legacy.full_text !== undefined || !!t.legacy.created_at) && !!t.core;
}

/** 递归搜集响应里所有推文（含引用、转发里嵌套的） */
export function collectTweets(json: unknown, out: RawTweet[] = [], depth = 0): RawTweet[] {
  if (!json || typeof json !== 'object' || depth > 60) return out;
  if (Array.isArray(json)) {
    for (const v of json) collectTweets(v, out, depth + 1);
    return out;
  }
  if (isTweet(json)) out.push(json);
  for (const v of Object.values(json)) {
    if (v && typeof v === 'object') collectTweets(v, out, depth + 1);
  }
  return out;
}
