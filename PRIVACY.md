# AllClip 隐私说明

AllClip 是一个把网页内容保存到你自己 Obsidian 仓库的浏览器插件。

## 我们不收集任何数据

- 没有服务器、没有账号、没有统计和埋点。
- 你保存的内容只在你的浏览器和你本机的 Obsidian 之间流转。

## 插件会访问什么

| 访问 | 用途 |
|---|---|
| 你正在看的页面 | 只在你点保存（快捷键、弹窗、右键、页内按钮）时读取正文、图片地址和作者等信息 |
| 推特、小红书、知乎、Reddit、微信公众号页面 | 页面里常驻很小的脚本：推特/小红书只读页面自己已经加载的数据；知乎/Reddit 只记录右键位置；不发出任何额外请求 |
| Reddit | 保存时向 reddit.com 请求这个帖子的公开 JSON（同源，用你自己的登录状态） |
| 图片和视频地址（twimg、xhscdn、zhimg、redd.it、qpic 等） | 下载图片/视频，写进你的 Obsidian 仓库 |
| 127.0.0.1 / localhost | 通过 Obsidian 的 Local REST API 插件写入笔记 |
| 剪贴板 | 用 obsidian:// 方式保存时，把笔记内容交给 Obsidian |

## 存在本地的信息

设置（包括 Local REST API 的 API Key）和“已保存记录”只存在浏览器本地（`chrome.storage.local`），不会同步，也不会发给任何人。

## 联系

有问题请在 GitHub 仓库提 Issue。
