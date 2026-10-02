// 用一个本地 HTTP 服务模拟 Obsidian Local REST API，验证读写和错误分类。
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RestError, readText, testConnection, writeBinary, writeText } from '../src/vault/rest';

const KEY = 'secret-key';
const files = new Map<string, { body: Buffer; type: string }>();
let server: Server;
let baseUrl = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${KEY}`) {
      res.writeHead(401).end();
      return;
    }
    const path = decodeURIComponent((req.url || '').replace(/^\/vault\/?/, ''));
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (req.method === 'PUT') {
        files.set(path, { body: Buffer.concat(chunks), type: String(req.headers['content-type']) });
        res.writeHead(204).end();
      } else if (path === '') {
        res.writeHead(200, { 'content-type': 'application/json' }).end('{"files":[]}');
      } else if (files.has(path)) {
        res.writeHead(200).end(files.get(path)!.body);
      } else {
        res.writeHead(404).end();
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});

afterAll(() => server.close());

describe('Local REST API 写入', () => {
  const cfg = () => ({ baseUrl, apiKey: `Bearer ${KEY} ` }); // 用户误粘 Bearer 前缀和空格也能用

  it('写入中文路径的笔记并读回', async () => {
    await writeText(cfg(), 'AllClip/小红书/2026-10-02 东京攻略.md', '# 你好');
    expect(files.get('AllClip/小红书/2026-10-02 东京攻略.md')?.type).toContain('text/markdown');
    expect(await readText(cfg(), 'AllClip/小红书/2026-10-02 东京攻略.md')).toBe('# 你好');
  });

  it('不存在的笔记返回 null', async () => {
    expect(await readText(cfg(), 'AllClip/无.md')).toBeNull();
  });

  it('写入二进制附件', async () => {
    await writeBinary(cfg(), 'AllClip/_assets/x/1-1.jpg', new Uint8Array([1, 2, 3]).buffer, 'image/jpeg');
    expect([...files.get('AllClip/_assets/x/1-1.jpg')!.body]).toEqual([1, 2, 3]);
  });

  it('Key 错误 → rest-auth；连不上 → rest-unreachable', async () => {
    await expect(writeText({ baseUrl, apiKey: 'wrong' }, 'a.md', 'x')).rejects.toMatchObject({ code: 'rest-auth' });
    const err = await readText({ baseUrl: 'http://127.0.0.1:1', apiKey: KEY }, 'a.md').catch((e) => e);
    expect(err).toBeInstanceOf(RestError);
    expect(err.code).toBe('rest-unreachable');
  });

  it('测试连接', async () => {
    expect((await testConnection(cfg())).ok).toBe(true);
    expect((await testConnection({ baseUrl, apiKey: 'wrong' })).ok).toBe(false);
  });
});
