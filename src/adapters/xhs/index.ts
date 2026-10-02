// 小红书适配器：优先读页面状态（页面脚本），拿不到再读已渲染的笔记。
import { AdapterError } from '../errors';
import type { Adapter } from '../registry';
import { askXhs } from './bridge';
import { buildXhsDoc } from './convert';
import { checkBlocked, currentNoteId, domNote } from './dom';

export const xhsAdapter: Adapter = {
  platform: 'xiaohongshu',
  match: (url) => /(^|\.)(xiaohongshu|rednote)\.com$/.test(url.hostname),
  async extract() {
    checkBlocked();
    const id = currentNoteId();
    if (!id) throw new AdapterError('请先点开一篇笔记再保存（信息流和搜索列表不能直接保存）');

    const res = await askXhs(id);
    const doc = res ? buildXhsDoc(res) : null;
    if (doc) {
      if (res!.from === 'api') doc.source = 'intercept';
      return doc;
    }
    const fallback = domNote(id);
    if (fallback) return fallback;
    throw new AdapterError('笔记内容还没加载出来，等一下再试');
  },
};
