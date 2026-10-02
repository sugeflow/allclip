// X / 推特适配器：优先用拦截到的 GraphQL 数据，拿不到再读页面。
import { AdapterError } from '../errors';
import type { Adapter } from '../registry';
import { askInterceptor } from './bridge';
import { buildXDoc } from './convert';
import { domTweet, findTweetArticle } from './dom';

export const xAdapter: Adapter = {
  platform: 'x',
  match: (url) => /(^|\.)(x|twitter)\.com$/.test(url.hostname),
  async extract(target) {
    const urlId = target?.id || location.pathname.match(/\/status\/(\d+)/)?.[1];
    // 先问拦截脚本：页内按钮指定的 > 右键目标 > 地址栏里的推文
    const probe = await askInterceptor(urlId);
    const targetId = (target?.id ? undefined : probe?.contextId) || urlId;
    if (!targetId) {
      throw new AdapterError('请打开一条推文，或在时间线的推文上右键 →“保存到 AllClip”');
    }

    let res = probe;
    if (probe && targetId !== urlId) res = await askInterceptor(targetId);
    const doc = res?.tweets.length ? buildXDoc(targetId, res.tweets) : null;
    if (doc) return doc;

    const article = findTweetArticle(targetId);
    const fallback = article && domTweet(article);
    if (fallback) return fallback;
    throw new AdapterError('页面上没找到这条推文，等它加载出来再试');
  },
};
