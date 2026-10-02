// 微信公众号文章。
// 做法参考 ZJ-clipper 的公众号适配思路（直接读正文容器 #js_content，绕开 Defuddle——它认不出公众号正文，
// 会混进页面杂项、丢图），以及 jackwener/wechat-article-to-markdown（MIT）的处理规则：
//   图片真实地址在 data-src（懒加载）；代码块 .code-snippet__fix 要去掉行号；发布时间在页面脚本的 ct / create_time 里。
// 图床 mmbiz.qpic.cn 不带 Referer 能拿到原图，带别的网站 Referer 会返回“此图片来自微信公众平台”占位图——
// 后台下载本来就不带 Referer。
import { htmlToMarkdown } from '../core/html-md';
import { liftImages } from '../core/media-md';
import type { ClipDoc } from '../core/types';
import type { Adapter } from './registry';

export const wechatAdapter: Adapter = {
  platform: 'wechat',
  match: (url) => url.hostname === 'mp.weixin.qq.com',
  async extract(): Promise<ClipDoc | null> {
    const content = document.querySelector('#js_content');
    if (!content) return null; // 不是文章页（图片消息、中转页等）交给通用模式
    return wechatDoc(document, location.href);
  },
};

export function wechatDoc(doc: Document, pageUrl: string): ClipDoc | null {
  const content = doc.querySelector('#js_content');
  if (!content) return null;
  const box = content.cloneNode(true) as Element;

  box.querySelectorAll('script, style, .qr_code_pc, .reward_area, mpvoice, mp-common-mpaudio').forEach((n) => n.remove());

  // 图片：data-src 才是真实地址
  box.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('data-src') || img.getAttribute('src') || '';
    if (!/^https?:\/\//.test(src)) return img.remove();
    img.setAttribute('src', src.replace(/^http:/, 'https:'));
  });

  // 代码块：去掉行号，换成标准 <pre><code>，交给 Turndown 生成围栏代码块
  box.querySelectorAll('.code-snippet__fix').forEach((el) => {
    el.querySelectorAll('.code-snippet__line-index').forEach((n) => n.remove());
    const lang = el.querySelector('pre[data-lang]')?.getAttribute('data-lang') || '';
    const lines = [...el.querySelectorAll('code')].map((c) => c.textContent || '').filter((t) => !/^[ce]?ounter\(line/.test(t));
    const pre = doc.createElement('pre');
    const code = doc.createElement('code');
    if (lang) code.className = `language-${lang}`;
    code.textContent = lines.length ? lines.join('\n') : el.textContent || '';
    pre.appendChild(code);
    el.replaceWith(pre);
  });

  // 正文里的一级标题降成二级（笔记标题已在 frontmatter / 文件名里）
  box.querySelectorAll('h1').forEach((h) => {
    const h2 = doc.createElement('h2');
    h2.innerHTML = h.innerHTML;
    h.replaceWith(h2);
  });

  // 视频：公众号视频是腾讯视频/公众号内嵌播放器，下载不了，留个原文链接
  box.querySelectorAll('iframe.video_iframe, mpvideosnap, mp-video, .js_editor_video').forEach((v) => {
    const p = doc.createElement('p');
    p.textContent = '▶ 视频（请在原文查看）';
    v.replaceWith(p);
  });

  const markdown = htmlToMarkdown(box as HTMLElement);
  if (!markdown) return null;
  const { body, media } = liftImages(markdown);

  const meta = (p: string) => doc.querySelector(`meta[property="${p}"]`)?.getAttribute('content')?.trim() || '';
  const text = (sel: string) => doc.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() || '';
  const account = text('#js_name') || text('.profile_nickname');
  const url = canonical(meta('og:url') || pageUrl);

  return {
    platform: 'wechat',
    kind: 'article',
    id: articleId(url),
    url,
    title: text('#activity-name') || meta('og:title') || doc.title,
    author: { name: account || meta('og:article:author') || '公众号' },
    published: publishTime(doc),
    tags: [],
    description: meta('og:description') || undefined,
    body,
    media,
    site: account || undefined,
    extra: { ...(meta('og:article:author') && meta('og:article:author') !== account ? { writer: meta('og:article:author') } : {}) },
    source: 'dom',
  };
}

/** 页面脚本里的发布时间：var ct = "1616309857" / create_time: JsDecode('…') / create_time: '…' */
function publishTime(doc: Document): string | undefined {
  const scripts = [...doc.querySelectorAll('script')].map((s) => s.textContent || '').join('\n');
  const m =
    scripts.match(/var ct\s*=\s*"(\d{9,})"/) ||
    scripts.match(/create_time\s*:\s*JsDecode\('(\d{9,})'\)/) ||
    scripts.match(/create_time\s*[:=]\s*["']?(\d{9,})["']?/);
  if (m) return new Date(Number(m[1]) * 1000).toISOString().replace('.000Z', 'Z');
  const shown = doc.querySelector('#publish_time')?.textContent?.match(/(\d{4})[-年](\d{1,2})[-月](\d{1,2})/);
  return shown ? `${shown[1]}-${shown[2]!.padStart(2, '0')}-${shown[3]!.padStart(2, '0')}` : undefined;
}

/** 短链 /s/<id> 用 id；长链用 __biz + mid + idx */
function articleId(url: string): string {
  try {
    const u = new URL(url);
    const short = u.pathname.match(/^\/s\/([\w-]{10,})/)?.[1];
    if (short) return short;
    const biz = u.searchParams.get('__biz');
    const mid = u.searchParams.get('mid');
    if (biz && mid) return `${biz.replace(/=+$/, '')}_${mid}_${u.searchParams.get('idx') || '1'}`;
  } catch {
    /* ignore */
  }
  return url;
}

/** 去掉分享带的跟踪参数，只留能打开文章的那几个 */
function canonical(raw: string): string {
  try {
    const u = new URL(raw.replace(/&amp;/g, '&'));
    u.protocol = 'https:';
    u.hash = '';
    if (u.pathname.startsWith('/s/') && u.pathname.length > 4) return `https://mp.weixin.qq.com${u.pathname}`;
    const keep = new URLSearchParams();
    for (const k of ['__biz', 'mid', 'idx', 'sn']) {
      const v = u.searchParams.get(k);
      if (v) keep.set(k, v);
    }
    return `https://mp.weixin.qq.com/s?${keep.toString()}`;
  } catch {
    return raw;
  }
}
