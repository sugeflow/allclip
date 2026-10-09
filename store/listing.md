# Chrome 商店上架材料

上传包：`.output/allclip-0.1.0-chrome.zip`（`pnpm zip` 生成）

## 素材

| 位置 | 文件 | 规格 |
|---|---|---|
| 商店图标 | `public/icon/128.png` | 128×128 |
| 截图 | `store/screenshot-1.png` | 1280×800 |
| 小型宣传图块 | `store/promo-small-440x280.png` | 440×280 |

截图和宣传图的源文件是 `store/shot-1.html`、`store/promo-small.html`，改完用无头 Chrome 重新截图。

## 商品详情

**名称**：AllClip

**摘要**（≤132 字符，取自 manifest）：
把网上看到的内容抓进 Obsidian：推特、小红书、知乎、Reddit、微信公众号和任意网页，图片一起存本地。

**类别**：工具（Tools）　**语言**：中文（简体）

**详细说明**：

```
AllClip 把你在网上看到的好内容，连同图片一起存进自己的 Obsidian 仓库，变成干净的 Markdown 笔记。

支持的平台
· 推特 / X：单条推文、长推文、线程（自动合并）、引用推文、X Article 长文、投票、原图、视频
· 小红书：图文笔记（多图、实况图）、视频笔记、话题标签、互动数据、评论（可选）
· 知乎：回答、专栏文章、想法，公式、脚注、链接卡片、代码块
· Reddit：文字/图片/图集/视频/外链帖子，得分最高的评论（带回复）
· 微信公众号：正文、懒加载图片、公众号名、发布时间、代码块
· 其它网页：自动提取正文

怎么用
· ⌥S（Windows 为 Alt+S）：直接保存当前页
· ⌥⇧S 或点工具栏图标：打开弹窗，可改标题、加标签、写备注
· 右键 → 保存到 AllClip：在推特/知乎/Reddit 的某一条上右键，只存那一条
· 推文和小红书笔记旁的「收录」按钮：一键存这一条
· 先选中一段文字：只存选中部分，存成摘录笔记

存得干净
· 统一的 frontmatter（平台、作者、链接、发布时间、标签、互动数据），方便用 Dataview / Bases 查询
· 图片下载到仓库本地，原帖删了、链接过期了也能看
· 同一篇内容再存一次会更新原笔记，你在「我的备注」下写的东西保留

连接 Obsidian
· 推荐：安装 Obsidian 的 Local REST API 插件，图片存本地
· 零配置：用 obsidian:// 链接保存，图片保留网络链接

隐私
没有服务器、没有账号、不收集任何数据。内容只在你的浏览器和本机的 Obsidian 之间流转。
开源（MIT）：https://github.com/sugeflow/allclip
```

## 隐私权规范（Privacy practices）

**单一用途说明**：
把用户正在浏览的网页内容（推特、小红书、知乎、Reddit、微信公众号和普通网页）转换成 Markdown 笔记，连同图片一起保存到用户本机的 Obsidian 仓库。

**权限理由**：

| 权限 | 理由 |
|---|---|
| storage | 在本地保存插件设置（Obsidian 连接方式、API Key、保存目录）和已保存内容的记录，用于再次保存时更新原笔记。 |
| activeTab | 用户点击图标、按快捷键或右键保存时，读取当前标签页的正文、标题、作者和图片地址。 |
| scripting | 用户在普通网页上触发保存时，向当前标签页注入提取正文的脚本。 |
| contextMenus | 提供右键菜单「保存到 AllClip」，在推特、知乎、Reddit 上可只保存右键所在的那一条。 |
| offscreen | 使用 obsidian:// 方式保存时，需要在离屏文档里把笔记内容写入剪贴板，交给 Obsidian 读取（Service Worker 无法直接访问剪贴板）。 |
| 主机权限：x.com、twitter.com、xiaohongshu.com、rednote.com、zhihu.com、reddit.com、mp.weixin.qq.com | 在这些网站上显示「收录」按钮、识别右键所在的内容，并读取页面已加载的数据，以完整保存长推文、线程、多图和视频。不会发出额外请求（Reddit 保存时请求该帖子的公开 JSON）。 |
| 主机权限：pbs.twimg.com、video.twimg.com、*.xhscdn.com、*.rednotecdn.com、*.zhimg.com、*.redd.it、mmbiz.qpic.cn | 下载帖子里的图片和视频，存进用户的 Obsidian 仓库，避免原链接过期或防盗链导致图片打不开。 |
| 主机权限：127.0.0.1、localhost | 通过用户本机 Obsidian 的 Local REST API 插件写入笔记和图片。只连接本机，不连接任何外部服务器。 |

**是否使用远程代码**：否，所有代码都打包在扩展里。

**数据使用**：
- 勾选「网站内容」（扩展会读取网页内容，但只写入用户本机的 Obsidian，不发送给开发者或任何第三方）。
- 勾选三项承诺：不出售或转让给第三方；不用于与单一用途无关的目的；不用于判断信用或贷款。

**隐私权政策网址**：https://github.com/sugeflow/allclip/blob/main/PRIVACY.md
