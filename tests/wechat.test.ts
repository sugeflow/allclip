// @vitest-environment happy-dom
// 公众号测试。wechat-article.html 是 2026-10-02 抓到的真实文章页面裁剪版（保留元数据、标题、公众号名、正文和时间脚本）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { wechatDoc } from '../src/adapters/wechat';
import { notePath } from '../src/render/filename';
import { renderNote } from '../src/render/markdown';

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html') as unknown as Document;
const page = parse(readFileSync('tests/fixtures/wechat-article.html', 'utf8'));

describe('真实文章', () => {
  const doc = wechatDoc(page, 'https://mp.weixin.qq.com/s/VdgRo7G-yzJymbP_oWCG1Q?scene=1&from=timeline#rd')!;
  const md = renderNote({ doc, options: {}, local: new Map() });

  it('元数据：标题、公众号名、发布时间、规范链接', () => {
    expect(doc.title).toBe('obsidian增强展示（dataview插件介绍）');
    expect(doc.author.name).toBe('软通达');
    expect(doc.published).toBe('2021-03-21T06:57:37Z');
    expect(doc.url).toBe('https://mp.weixin.qq.com/s/VdgRo7G-yzJymbP_oWCG1Q');
    expect(doc.id).toBe('VdgRo7G-yzJymbP_oWCG1Q');
    expect(notePath(doc, 'AllClip')).toMatch(/^AllClip\/公众号\/2021-03-21 软通达 obsidian增强展示（dataview插件介绍）$/);
  });

  it('图片一张不丢，取 data-src 的真实地址', () => {
    expect(doc.media.map((m) => m.url)).toEqual([
      'https://mmbiz.qpic.cn/mmbiz_jpg/IPZ262EcUIPMiaT5Ms0p6zk7YP9GFKQUI0C7GxFd7jMyPWm2UxlG0wytqRLLB1QJLrKOtSENaiaGbQcTzwiaEDVXg/640?wx_fmt=jpeg',
      'https://mmbiz.qpic.cn/mmbiz_png/IPZ262EcUIPMiaT5Ms0p6zk7YP9GFKQUIRciaxc2Voc6sO2fyP5Sqes4QOKpv4ZibyHFFPHpMPVf4SGySrgpAiaxLA/640?wx_fmt=png',
    ]);
  });

  it('正文完整，没有页面杂项', () => {
    expect(md).toContain('本文介绍了dataview插件');
    expect(md).toContain('## 插件介绍');
    expect(md).not.toContain('在小说阅读器读本章');
  });
});

describe('代码块和长链接', () => {
  it('.code-snippet__fix 去掉行号，转成围栏代码块', () => {
    const d = wechatDoc(
      parse(`<html><body><h1 id="activity-name">T</h1><a id="js_name">号</a><div id="js_content">
        <section class="code-snippet__fix"><ul class="code-snippet__line-index"><li></li><li></li></ul>
        <pre data-lang="python"><code><span>print(1)</span></code><code><span>print(2)</span></code></pre></section></div></body></html>`),
      'https://mp.weixin.qq.com/s?__biz=MzA5NjA%3D%3D&mid=2650&idx=2&sn=abc&chksm=xyz&scene=21',
    )!;
    expect(d.body).toBe('```python\nprint(1)\nprint(2)\n```');
    expect(d.id).toBe('MzA5NjA_2650_2');
    expect(d.url).toBe('https://mp.weixin.qq.com/s?__biz=MzA5NjA%3D%3D&mid=2650&idx=2&sn=abc');
  });

  it('不是文章页返回 null', () => {
    expect(wechatDoc(parse('<html><body><p>hi</p></body></html>'), 'https://mp.weixin.qq.com/')).toBeNull();
  });
});
