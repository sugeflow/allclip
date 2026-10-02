// Obsidian「Local REST API」插件：https://github.com/coddingtonbear/obsidian-local-rest-api
// PUT /vault/{path} 创建或覆盖；GET /vault/{path} 读取（404 = 不存在）。
// 写法参考 ZJ-clipper utils/rest.ts 的思路。

export interface RestConfig {
  baseUrl: string;
  apiKey: string;
}

export class RestError extends Error {
  constructor(
    message: string,
    public code: 'rest-unreachable' | 'rest-auth' | 'failed',
  ) {
    super(message);
  }
}

const base = (u: string) => u.trim().replace(/\/+$/, '');
const auth = (k: string) => `Bearer ${k.trim().replace(/^Bearer\s+/i, '')}`;
const encodePath = (p: string) => p.split('/').filter(Boolean).map(encodeURIComponent).join('/');

async function call(cfg: RestConfig, path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${base(cfg.baseUrl)}/vault/${encodePath(path)}`, {
      ...init,
      headers: { Authorization: auth(cfg.apiKey), ...(init.headers || {}) },
    });
  } catch {
    throw new RestError('连不上 Obsidian：请确认 Obsidian 已打开，Local REST API 插件已启用并开启了 HTTP 服务', 'rest-unreachable');
  }
  if (res.status === 401 || res.status === 403) throw new RestError('API Key 不对，请在插件设置里重新复制', 'rest-auth');
  return res;
}

/** 读取笔记内容；不存在返回 null */
export async function readText(cfg: RestConfig, path: string): Promise<string | null> {
  const res = await call(cfg, path, { headers: { Accept: 'text/markdown' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new RestError(`读取失败：HTTP ${res.status}`, 'failed');
  return res.text();
}

export async function writeText(cfg: RestConfig, path: string, content: string): Promise<void> {
  const res = await call(cfg, path, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    body: content,
  });
  if (!res.ok) throw new RestError(`保存失败：HTTP ${res.status}`, 'failed');
}

export async function writeBinary(cfg: RestConfig, path: string, bytes: ArrayBuffer, mime: string): Promise<void> {
  const res = await call(cfg, path, {
    method: 'PUT',
    headers: { 'Content-Type': mime || 'application/octet-stream' },
    body: bytes,
  });
  if (!res.ok) throw new RestError(`写入附件失败：HTTP ${res.status}`, 'failed');
}

/** 设置页“测试连接” */
export async function testConnection(cfg: RestConfig): Promise<{ ok: boolean; msg: string }> {
  try {
    const res = await call(cfg, '');
    if (res.ok) return { ok: true, msg: '已连上 Obsidian，鉴权通过' };
    return { ok: false, msg: `连接失败：HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, msg: (e as Error).message };
  }
}
