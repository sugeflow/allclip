// 小红书页面常驻脚本（MAIN world，document_start），逻辑见 src/adapters/xhs/main.ts。
import { installXhsMain } from '../src/adapters/xhs/main';

export default defineContentScript({
  matches: ['https://www.xiaohongshu.com/*', 'https://www.rednote.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main: installXhsMain,
});
