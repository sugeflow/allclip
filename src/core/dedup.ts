// 去重索引：platform:id → 笔记路径。索引丢了也能靠 frontmatter 的 platform + id 重建。
import type { SavedEntry } from './messages';
import type { ClipDoc } from './types';

const KEY = 'savedIndex';
const keyOf = (d: Pick<ClipDoc, 'platform' | 'id'>) => `${d.platform}:${d.id}`;

async function all(): Promise<Record<string, SavedEntry>> {
  const r = await chrome.storage.local.get(KEY);
  return (r[KEY] as Record<string, SavedEntry>) || {};
}

export async function findSaved(doc: Pick<ClipDoc, 'platform' | 'id'>): Promise<SavedEntry | undefined> {
  return (await all())[keyOf(doc)];
}

export async function markSaved(doc: Pick<ClipDoc, 'platform' | 'id'>, entry: SavedEntry): Promise<void> {
  const idx = await all();
  idx[keyOf(doc)] = entry;
  await chrome.storage.local.set({ [KEY]: idx });
}

export async function savedCount(): Promise<number> {
  return Object.keys(await all()).length;
}

export async function clearSaved(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}
