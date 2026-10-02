// 知乎、Reddit 常驻的右键标记脚本（很小，只记录右键位置），逻辑见 src/core/context-mark.ts。
import { installContextMarker } from '../src/core/context-mark';
import { REDDIT_ITEM } from '../src/adapters/reddit/selectors';
import { ZHIHU_ITEM } from '../src/adapters/zhihu/selectors';

export default defineContentScript({
  matches: ['https://www.zhihu.com/*', 'https://zhuanlan.zhihu.com/*', 'https://www.reddit.com/*', 'https://old.reddit.com/*'],
  runAt: 'document_idle',
  main() {
    installContextMarker(location.hostname.endsWith('reddit.com') ? REDDIT_ITEM : ZHIHU_ITEM);
  },
});
