// 通用网页：用 Defuddle 提取正文（Obsidian 官方剪藏同款），作为所有平台的兜底。
import Defuddle from 'defuddle';
import { htmlToMarkdown } from '../core/html-md';
import { canonicalUrl, liftImages, shortHash } from '../core/media-md';
import type { Adapter } from './registry';
import type { ClipDoc } from '../core/types';

export const webAdapter: Adapter = {
  platform: 'web',
  match: () => true,
  async extract(): Promise<ClipDoc | null> {
    // Defuddle 会改动传入的文档（删 script 等），用副本，不影响用户正在看的页面
    const clone = document.cloneNode(true) as Document;
    // 用 Defuddle 核心版取正文 HTML，再用自己的 Turndown 转 Markdown（完整版会让注入脚本大一倍）
    const res = await new Defuddle(clone, { url: location.href }).parseAsync();
    const markdown = res.content ? htmlToMarkdown(res.content) : '';
    if (!markdown) return null;

    const url = canonicalUrl(location.href);
    const { body, media } = liftImages(markdown);
    return {
      platform: 'web',
      kind: 'page',
      id: await shortHash(url),
      url,
      title: (res.title || document.title || url).trim(),
      author: { name: (res.author || '').trim() },
      published: res.published || undefined,
      lang: res.language || undefined,
      tags: [],
      description: (res.description || '').trim() || undefined,
      body,
      media,
      site: res.site || location.hostname,
      extra: res.image ? { cover: res.image } : undefined,
      source: 'defuddle',
    };
  },
};
