import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

export default defineConfig({
  srcDir: '.',
  vite: () => ({
    plugins: [preact()],
  }),
  manifest: {
    name: 'AllClip',
    homepage_url: 'https://github.com/sugeflow/allclip',
    description: '把网上看到的内容抓进 Obsidian：推特、小红书、知乎、Reddit、微信公众号和任意网页，图片一起存本地。',
    permissions: ['storage', 'activeTab', 'scripting', 'contextMenus', 'offscreen'],
    host_permissions: [
      'http://127.0.0.1/*',
      'https://127.0.0.1/*',
      'http://localhost/*',
      'https://localhost/*',
      'https://x.com/*',
      'https://twitter.com/*',
      'https://pbs.twimg.com/*',
      'https://video.twimg.com/*',
      'https://www.xiaohongshu.com/*',
      'https://www.rednote.com/*',
      'https://*.rednotecdn.com/*',
      'https://*.xhscdn.com/*',
      'https://*.zhihu.com/*',
      'https://*.zhimg.com/*',
      'https://www.reddit.com/*',
      'https://*.redd.it/*',
      'https://mp.weixin.qq.com/*',
      'https://mmbiz.qpic.cn/*',
    ],
    commands: {
      'quick-save': {
        suggested_key: { default: 'Alt+S', mac: 'Alt+S' },
        description: '一键保存当前内容到 Obsidian',
      },
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+S', mac: 'Alt+Shift+S' },
        description: '打开保存弹窗',
      },
    },
  },
});
