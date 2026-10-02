// 插件设置：存在 chrome.storage.local（API Key 不进 sync）。

export type SaveMethod = 'rest' | 'uri';

export interface Settings {
  saveMethod: SaveMethod;
  /** Obsidian 仓库名：URI 方式保存、以及保存后“在 Obsidian 中打开”都要用 */
  vaultName: string;
  /** Local REST API 地址（HTTP 服务） */
  restBaseUrl: string;
  restApiKey: string;
  /** Vault 里的根文件夹 */
  rootFolder: string;
  /** 图片下载到本地附件（仅 REST 方式生效） */
  saveImagesLocal: boolean;
  /** 视频默认是否下载（弹窗里可单次勾选） */
  downloadVideoByDefault: boolean;
  /** 视频大小上限（MB） */
  videoMaxMB: number;
  /** Reddit 默认保存的最高赞一级评论条数，0 = 不存 */
  redditTopComments: number;
  /** 保存后自动在 Obsidian 中打开 */
  openAfterSave: boolean;
  /** 在推文、小红书笔记旁显示“收录”按钮 */
  showInlineButton: boolean;
  /** 文件名模板：{date} {author} {title} {platform} {id} */
  filenameTemplate: string;
  /** 新笔记的 status 字段 */
  statusValue: string;
  /** 每篇笔记都加上的标签 */
  extraTags: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  saveMethod: 'rest',
  vaultName: '',
  restBaseUrl: 'http://127.0.0.1:27123',
  restApiKey: '',
  rootFolder: 'AllClip',
  saveImagesLocal: true,
  downloadVideoByDefault: false,
  videoMaxMB: 200,
  redditTopComments: 10,
  openAfterSave: false,
  showInlineButton: true,
  filenameTemplate: '{date} {author} {title}',
  statusValue: 'inbox',
  extraTags: [],
};

const KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get(KEY);
  return { ...DEFAULT_SETTINGS, ...(r[KEY] as Partial<Settings> | undefined) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

/** 是否已完成最低限度的配置 */
export function isConfigured(s: Settings): boolean {
  if (s.saveMethod === 'rest') return !!s.restApiKey.trim();
  return !!s.vaultName.trim();
}
