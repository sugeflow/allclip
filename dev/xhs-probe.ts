// 开发用：注入小红书页面，验证页面脚本读状态 + 转换 + DOM 兜底。不会打包进插件。
import { askXhs } from '../src/adapters/xhs/bridge';
import { buildXhsDoc } from '../src/adapters/xhs/convert';
import { currentNoteId, domNote } from '../src/adapters/xhs/dom';
import { installXhsMain } from '../src/adapters/xhs/main';
installXhsMain();
(window as any).__probe = async () => {
  const id = currentNoteId();
  const t0 = performance.now();
  const res = id ? await askXhs(id) : null;
  const ms = Math.round(performance.now() - t0);
  const doc = res ? buildXhsDoc(res) : null;
  const dom = id ? domNote(id) : null;
  const brief = (d: any) => d && { title: d.title, author: d.author.name, published: d.published, tags: d.tags, stats: d.stats, media: d.media.map((m: any) => m.kind + ':' + m.url.slice(8, 60)), body: d.body.slice(0, 160), comments: d.comments?.length };
  return { id, from: res?.from, ms, state: brief(doc), dom: brief(dom) };
};
