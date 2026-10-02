// obsidian:// URI 方式（Obsidian 官方剪藏的做法）：
// 内容先放进剪贴板，再打开 obsidian://new?...&clipboard，由 Obsidian 从剪贴板读取。
// 好处是零配置；缺点是图片只能保留远程链接。

export function newNoteUri(vault: string, path: string, overwrite: boolean): string {
  let u = `obsidian://new?file=${encodeURIComponent(path)}`;
  if (vault.trim()) u += `&vault=${encodeURIComponent(vault.trim())}`;
  if (overwrite) u += '&overwrite=true';
  return u;
}

export function openNoteUri(vault: string, path: string): string {
  let u = `obsidian://open?file=${encodeURIComponent(path)}`;
  if (vault.trim()) u += `&vault=${encodeURIComponent(vault.trim())}`;
  return u;
}

/** 剪贴板写入成功时用 &clipboard，失败时把正文直接塞进 URL（长文可能被截断） */
export function withContent(uri: string, content: string, viaClipboard: boolean): string {
  return viaClipboard ? `${uri}&clipboard` : `${uri}&content=${encodeURIComponent(content)}`;
}
