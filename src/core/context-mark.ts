// 右键标记：常驻脚本在右键时给鼠标所在的“内容卡片”打上时间戳，抓取时优先用它（8 秒内有效）。
// 这样在信息流里右键某条回答/帖子 →“保存到 AllClip”，存的就是那一条，而不是屏幕中间那条。
const ATTR = 'data-allclip-ctx';

export function installContextMarker(itemSelector: string): void {
  document.addEventListener(
    'contextmenu',
    (e) => {
      document.querySelectorAll(`[${ATTR}]`).forEach((el) => el.removeAttribute(ATTR));
      const item = (e.target as Element | null)?.closest?.(itemSelector);
      item?.setAttribute(ATTR, String(Date.now()));
    },
    true,
  );
}

/** 最近 8 秒内右键过的卡片 */
export function contextItem(itemSelector: string): Element | null {
  const el = document.querySelector(`[${ATTR}]`);
  if (!el || !el.matches(itemSelector)) return null;
  return Date.now() - Number(el.getAttribute(ATTR)) < 8000 ? el : null;
}
