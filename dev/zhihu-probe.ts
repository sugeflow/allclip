// 开发用：注入知乎页面验证适配器。不会打包进插件。
import { zhihuAdapter } from '../src/adapters/zhihu';
(window as any).__probe = async () => {
  try {
    const d = await zhihuAdapter.extract();
    return d && { kind: d.kind, id: d.id, url: d.url, title: d.title, author: d.author, published: d.published, tags: d.tags, stats: d.stats, source: d.source, media: d.media.length, len: d.body.length, head: d.body.slice(0, 300), tail: d.body.slice(-200) };
  } catch (e) { return 'ERR ' + (e as Error).message; }
};
