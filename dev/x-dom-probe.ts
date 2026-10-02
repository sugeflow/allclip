// 开发用：在 x.com 页面里验证 DOM 兜底。不会打包进插件。
import { domTweet, findTweetArticle } from '../src/adapters/x/dom';
(window as any).__dom = (id?: string) => { const a = findTweetArticle(id); return a ? domTweet(a) : 'no article'; };
