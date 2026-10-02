// 仅用于在普通浏览器里预览弹窗/设置页：模拟 chrome.* API。不会打包进插件。
(() => {
  const q = new URLSearchParams(location.search);
  const state = q.get('state') || 'ready';
  const store = {
    settings: state === 'unconfigured' ? {} : { saveMethod: 'rest', vaultName: 'Library', restApiKey: 'xxx', rootFolder: 'AllClip' },
    savedIndex: { a: {}, b: {}, c: {} },
  };
  const doc = {
    platform: q.get('platform') || 'x', kind: 'post', id: '1843000000000000000',
    url: 'https://x.com/karpathy/status/1843000000000000000',
    title: '',
    author: { name: 'Andrej Karpathy', handle: '@karpathy' },
    published: '2026-09-30T14:21:00Z', tags: [],
    body: '训练大模型时最容易被低估的是数据清洗。我花了两周把预训练语料里的重复段落去掉，loss 曲线立刻平滑了很多。几个具体做法：1）按段落做 MinHash 去重；2）过滤掉模板化的网页尾部；3）保留代码块原样。{{media:0}}',
    media: [
      { kind: 'image', url: 'https://picsum.photos/seed/a1/400/400', downloadable: true },
      { kind: 'image', url: 'https://picsum.photos/seed/b2/400/400', downloadable: true },
      { kind: 'image', url: 'https://picsum.photos/seed/c3/400/400', downloadable: true },
      { kind: 'image', url: 'https://picsum.photos/seed/d4/400/400', downloadable: true },
      { kind: 'image', url: 'https://picsum.photos/seed/e5/400/400', downloadable: true },
      { kind: 'video', url: 'https://video.twimg.com/x.mp4', downloadable: true },
    ],
    comments: q.get('platform') === 'reddit' ? new Array(10).fill({ author: 'u', text: 't' }) : undefined,
    source: 'intercept',
  };
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  window.chrome = {
    storage: {
      local: {
        get: async (k) => ({ [k]: store[k] }),
        set: async (o) => Object.assign(store, o),
        remove: async (k) => delete store[k],
      },
      session: { get: async () => ({}), set: async () => {} },
    },
    tabs: { query: async () => [{ id: 1 }], create: async () => {} },
    commands: { getAll: async () => [{ name: 'quick-save', shortcut: '⌥S' }, { name: '_execute_action', shortcut: '⌥⇧S' }] },
    runtime: {
      openOptionsPage: () => {},
      sendMessage: async (msg) => {
        await delay(msg.type === 'preview' ? (state === 'loading' ? 1e9 : 300) : 700);
        if (msg.type === 'preview') {
          if (state === 'unsupported') return { ok: false, code: 'unsupported', error: '这个页面不能保存（浏览器内置页面或扩展商店）' };
          return {
            ok: true, doc, configured: state !== 'unconfigured',
            notePath: 'AllClip/X/2026-09-30 @karpathy 训练大模型时最容易被低估的是数据清洗',
            selection: state === 'selection' ? '训练大模型时最容易被低估的是数据清洗。我花了两周把预训练语料里的重复段落去掉，loss 曲线立刻平滑了很多。' : undefined,
            saved: state === 'dup' ? { path: 'AllClip/X/2026-09-30 @karpathy 训练大模型时最容易被低估的是数据清洗', savedAt: new Date(Date.now() - 86400e3 * 3).toISOString(), title: 'x' } : undefined,
          };
        }
        if (msg.type === 'save') {
          if (state === 'save-error' && !msg.methodOverride) return { ok: false, code: 'rest-unreachable', error: '连不上 Obsidian：请确认 Obsidian 已打开，Local REST API 插件已启用并开启了 HTTP 服务' };
          return { ok: true, path: 'AllClip/X/2026-09-30 @karpathy ' + (msg.options.title || ''), images: { saved: 5, total: 5 }, updated: state === 'dup', openUrl: 'obsidian://open' };
        }
        if (msg.type === 'test-rest') return { ok: true, msg: '已连上 Obsidian，鉴权通过' };
      },
    },
  };
})();
