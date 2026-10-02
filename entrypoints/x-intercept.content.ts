// X 页面常驻的拦截脚本（MAIN world，document_start），逻辑见 src/adapters/x/intercept.ts。
import { installInterceptor } from '../src/adapters/x/intercept';

export default defineContentScript({
  matches: ['https://x.com/*', 'https://twitter.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main: installInterceptor,
});
