#!/bin/sh
# 构建后生成可在普通浏览器打开的预览目录：在 popup/options 页面前注入 mock-chrome.js
set -e
cd "$(dirname "$0")/.."
OUT=.output/preview
rm -rf "$OUT" && cp -R .output/chrome-mv3 "$OUT" && cp dev/mock-chrome.js "$OUT/"
for f in popup options; do
  sed -i '' 's#<head>#<head><script src="/mock-chrome.js"></script>#' "$OUT/$f.html"
done
cat > "$OUT/index.html" <<'HTML'
<!doctype html><meta charset="utf-8"><title>AllClip 预览</title>
<style>body{margin:0;padding:24px;background:#ddd8cc;font:13px -apple-system,sans-serif;display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start}
figure{margin:0}figcaption{margin-bottom:6px;color:#555}iframe{border:0;width:380px;height:620px;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.2);background:#f4f1ea}</style>
<figure><figcaption>识别成功</figcaption><iframe src="popup.html?state=ready"></iframe></figure>
<figure><figcaption>收录过 + Reddit 评论</figcaption><iframe src="popup.html?state=dup&platform=reddit"></iframe></figure>
<figure><figcaption>未配置</figcaption><iframe src="popup.html?state=unconfigured"></iframe></figure>
<figure><figcaption>选中了文字</figcaption><iframe src="popup.html?state=selection"></iframe></figure>
<figure><figcaption>不支持的页面</figcaption><iframe src="popup.html?state=unsupported" style="height:300px"></iframe></figure>
<figure><figcaption>加载中</figcaption><iframe src="popup.html?state=loading" style="height:300px"></iframe></figure>
<figure><figcaption>保存失败（点保存）</figcaption><iframe src="popup.html?state=save-error"></iframe></figure>
HTML
echo "$OUT"
