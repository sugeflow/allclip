// 平台适配器注册表：按顺序匹配，第一个能产出结果的胜出，最后由通用网页兜底。
import type { ExtractTarget } from '../core/messages';
import type { ClipDoc, Platform } from '../core/types';
import { AdapterError } from './errors';
import { webAdapter } from './web';
import { xAdapter } from './x';
import { xhsAdapter } from './xhs';

export interface Adapter {
  platform: Platform;
  match(url: URL): boolean;
  /** 返回 null 表示“这页我处理不了”，交给下一个适配器；抛 AdapterError 表示直接告诉用户原因 */
  extract(target?: ExtractTarget): Promise<ClipDoc | null>;
}

const ADAPTERS: Adapter[] = [xAdapter, xhsAdapter];

export async function extractCurrentPage(target?: ExtractTarget): Promise<ClipDoc> {
  const url = new URL(location.href);
  for (const a of ADAPTERS) {
    if (!a.match(url)) continue;
    try {
      const doc = await a.extract(target);
      if (doc) return doc;
    } catch (e) {
      if (e instanceof AdapterError) throw e;
      console.warn(`[AllClip] ${a.platform} 适配器失败，改用通用模式`, e);
    }
  }
  const doc = await webAdapter.extract();
  if (!doc) throw new Error('没有识别到正文');
  return doc;
}
