// 小红书页面脚本与抓取脚本之间的消息格式（通信本身见 core/main-bridge.ts）。
import { askMain } from '../../core/main-bridge';

export const XHS_NS = 'xhs';

export interface XhsBridgeRequest {
  id: string;
}

export interface XhsBridgeResponse {
  note: Record<string, unknown>;
  comments?: Record<string, unknown>[];
  from: 'state' | 'api';
}

export const askXhs = (id: string) => askMain<XhsBridgeRequest, XhsBridgeResponse>(XHS_NS, { id }, 600);
