// @vitest-environment happy-dom
// 知乎测试。zhihu-answer.json 来自 2026-10-02 在知乎上实际读到的 js-initialData（裁掉了用不到的字段）；
// zhihu-special.html 是按知乎页面写法手工拼的，覆盖公式、脚注、跳转链接、卡片、视频、代码、目录。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { answerFromEntities, buildZhihuDoc, pinFromEntities } from '../src/adapters/zhihu/convert';
import { realUrl, zhihuHtmlToMarkdown } from '../src/adapters/zhihu/html';
import { notePath } from '../src/render/filename';
import { renderNote } from '../src/render/markdown';
import fx from './fixtures/zhihu-answer.json';

const entities = { answers: { [fx.answer.id]: fx.answer }, questions: { [fx.question.id]: fx.question } };

describe('回答', () => {
  const doc = buildZhihuDoc(answerFromEntities(entities, fx.answer.id)!);
  const md = renderNote({ doc, options: {}, local: new Map() });

  it('元数据', () => {
    expect(doc.kind).toBe('answer');
    expect(doc.url).toBe('https://www.zhihu.com/question/19550225/answer/1994061208941242054');
    expect(doc.title).toBe('如何正确使用知乎？');
    expect(doc.author).toMatchObject({ name: '曹力科', url: 'https://www.zhihu.com/people/guidaogui' });
    expect(doc.published).toBe('2026-01-12T07:00:40Z');
    expect(doc.tags).toEqual(['知乎指南', '知乎15周年']);
    expect(doc.stats).toEqual({ likes: 2878, replies: 199, collects: 3536 });
    expect(notePath(doc, 'AllClip')).toBe('AllClip/知乎/2026-01-12 曹力科 如何正确使用知乎？');
  });

  it('问题描述放在 callout 里', () => {
    expect(md).toContain('> [!question] 问题描述\n> 2011年，知乎上线');
  });

  it('图片取原图（_r.jpg），图注作 alt，懒加载占位图和 noscript 副本都不要', () => {
    expect(doc.media.map((m) => m.url)).toEqual([
      'https://pic1.zhimg.com/v2-d13f9dddb762dce596bf970e2571e62c_r.jpg?source=2c26e567',
      'https://picx.zhimg.com/v2-78dc224261dde704ee8171c4739b38cf_r.jpg?source=2c26e567',
    ]);
    expect(doc.media[0]!.alt).toBe('知乎热榜');
    expect(md).not.toContain('data:image');
    expect(md).not.toContain('知乎热榜\n\n知乎热榜'); // 图注不重复
  });

  it('拆成片段显示的长链接还原成完整地址；分隔线', () => {
    expect(md).toContain('(https://www.zhihu.com/knowledge-plan/hot-question/hot/0/day)');
    expect(md).toContain('\n---\n');
  });
});

describe('特殊元素', () => {
  const { body, media } = zhihuHtmlToMarkdown(readFileSync('tests/fixtures/zhihu-special.html', 'utf8'));

  it('公式不被转义', () => {
    expect(body).toContain('质能方程 $E=mc^2$ 很有名，勾股定理是 $a^2+b^2=c^2$。');
    expect(body).toContain('$$\n\\int_0^1 x\\,dx=\\frac12\n$$');
    expect(media).toHaveLength(0); // 公式图片不当成图片
  });

  it('脚注', () => {
    expect(body).toContain('这个结论来自论文[^1]，另见[^2]。');
    expect(body).toContain('[^1]: [Attention Is All You Need](https://arxiv.org/abs/1706.03762)');
    expect(body).toContain('[^2]: 知乎专栏');
  });

  it('跳转链接解码、卡片、视频、引用、列表、代码、@', () => {
    expect(body).toContain('[https://example.com/path?a=1](https://example.com/path?a=1)');
    expect(body).toContain('\n[卡片里的文章标题](https://zhuanlan.zhihu.com/p/123456)\n');
    expect(body).toContain('[▶ 一个视频](https://www.zhihu.com/video/987654)');
    expect(body).toContain('> 引用一段话');
    expect(body).toContain('- 第一点\n- 第二点');
    expect(body).toContain('```python\nprint("hello")\n```');
    expect(body).toContain('[@某人](https://www.zhihu.com/people/abc)');
  });

  it('目录被删掉', () => {
    expect(body).not.toContain('目录：');
  });

  it('realUrl', () => {
    expect(realUrl('https://link.zhihu.com/?target=https%3A//a.com/b')).toBe('https://a.com/b');
    expect(realUrl('//www.zhihu.com/question/1')).toBe('https://www.zhihu.com/question/1');
    expect(realUrl('')).toBe('');
  });
});

describe('想法', () => {
  it('文字块 + 图片块，没有标题时用正文开头', () => {
    const info = pinFromEntities(
      {
        pins: { '99': { id: '99', author: 'u1', created: 1768201240, commentCount: 3, reactionCount: 10, content: [{ type: 'text', content: '今天天气不错' }, { type: 'image', url: 'https://pic1.zhimg.com/v2-a.jpg', originalUrl: 'https://pic1.zhimg.com/v2-a_r.jpg' }] } },
        users: { u1: { name: '某人', urlToken: 'mr' } },
      },
      '99',
    )!;
    const doc = buildZhihuDoc(info);
    expect(doc.url).toBe('https://www.zhihu.com/pin/99');
    expect(doc.title).toBe('');
    expect(doc.body).toBe('今天天气不错\n\n{{media:0}}');
    expect(doc.media[0]!.url).toBe('https://pic1.zhimg.com/v2-a_r.jpg');
    expect(doc.stats).toEqual({ likes: 10, replies: 3 });
  });
});
