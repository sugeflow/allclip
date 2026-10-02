// 统一数据结构：所有平台适配器只负责产出 ClipDoc，渲染、去重、写入全部共用。
// 设计说明见 docs/design.md 第 4 节。

export type Platform = 'x' | 'xiaohongshu' | 'zhihu' | 'reddit' | 'web';

export type ClipKind = 'post' | 'thread' | 'article' | 'answer' | 'note' | 'pin' | 'page';

export interface Author {
  name: string;
  handle?: string;
  url?: string;
  avatar?: string;
}

export interface Stats {
  likes?: number;
  reposts?: number;
  replies?: number;
  collects?: number;
  views?: number;
  bookmarks?: number;
  score?: number;
}

export interface MediaItem {
  kind: 'image' | 'video' | 'gif' | 'live-photo';
  /** 最高清的地址 */
  url: string;
  /** 视频封面 */
  poster?: string;
  alt?: string;
  width?: number;
  height?: number;
  /** blob/HLS 流为 false，只存封面 + 原帖链接 */
  downloadable: boolean;
  /** 视频的多档清晰度（mp4），下载时挑不超过大小上限的最高档 */
  variants?: { url: string; bitrate?: number; size?: number }[];
  durationMs?: number;
}

export interface CommentNode {
  author: string;
  text: string;
  likes?: number;
  published?: string;
  children?: CommentNode[];
}

export interface ClipDoc {
  platform: Platform;
  kind: ClipKind;
  /** 平台内唯一 ID；通用网页用 URL 的哈希 */
  id: string;
  /** 规范化后的永久链接 */
  url: string;
  title: string;
  author: Author;
  published?: string;
  updated?: string;
  lang?: string;
  /** 平台自带标签：话题、subreddit、知乎话题 */
  tags: string[];
  stats?: Stats;
  description?: string;
  /** Markdown 正文，媒体位置用占位符 {{media:N}} */
  body: string;
  media: MediaItem[];
  quoted?: ClipDoc;
  comments?: CommentNode[];
  /** 站点名（通用网页用） */
  site?: string;
  extra?: Record<string, unknown>;
  /** 数据来源，方便排查 */
  source: 'intercept' | 'state' | 'json' | 'dom' | 'defuddle';
}

/** 保存时用户在弹窗里填的选项 */
export interface SaveOptions {
  title?: string;
  tags?: string[];
  note?: string;
  downloadVideo?: boolean;
  includeComments?: boolean;
  /** 只保存这段选中的内容（Markdown），存成单独的摘录笔记 */
  selection?: string;
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  x: 'X',
  xiaohongshu: '小红书',
  zhihu: '知乎',
  reddit: 'Reddit',
  web: 'Web',
};

/** 媒体占位符 */
export const mediaToken = (i: number) => `{{media:${i}}}`;
export const MEDIA_TOKEN_RE = /\{\{media:(\d+)\}\}/g;
