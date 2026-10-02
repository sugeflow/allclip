// 通用 HTML → Markdown（Turndown + GFM 表格/删除线/任务列表），通用网页、知乎、Reddit 共用。
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

export function createTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    hr: '---',
  });
  td.use(gfm);
  td.remove(['script', 'style', 'noscript', 'button', 'iframe']);
  return td;
}

let shared: TurndownService | null = null;

export function htmlToMarkdown(html: string | HTMLElement): string {
  shared ??= createTurndown();
  return tidy(shared.turndown(html));
}

/** Turndown 的列表符号后面是 3 个空格，统一成 1 个；合并多余空行 */
export function tidy(md: string): string {
  return md
    .replace(/^(\s*)([-*+]|\d+\.)\s{2,}/gm, '$1$2 ')
    .replace(/^[ \t\u00a0]+$/gm, '') // 只有空格的行（公众号等页面的 <p>&nbsp;</p>、列表项尾巴）
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
