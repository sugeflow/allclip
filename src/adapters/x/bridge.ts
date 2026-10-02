// X 页面脚本与抓取脚本之间的消息格式（通信本身见 core/main-bridge.ts）。
import { askMain } from '../../core/main-bridge';
import type { RawTweet } from './raw';

export const X_NS = 'x';

export interface XBridgeRequest {
  /** 想要的推文 ID；为空时只返回右键目标 */
  id?: string;
}

export interface XBridgeResponse {
  /** 最近一次（8 秒内）右键所在推文的 ID */
  contextId?: string;
  /** 目标推文 + 同一会话里已缓存的推文 */
  tweets: RawTweet[];
}

export const askInterceptor = (id?: string) => askMain<XBridgeRequest, XBridgeResponse>(X_NS, { id });
