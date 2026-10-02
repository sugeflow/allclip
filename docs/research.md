# 现成开源方案调研（2026-10-02）

目标：Chrome 插件，把看到的内容抓进自己的知识库。先后顺序：X/推特 → 小红书 → 知乎 → Reddit。

## 通用底座

| 项目 | 许可 | 说明 | 可用方式 |
|---|---|---|---|
| [obsidianmd/obsidian-clipper](https://github.com/obsidianmd/obsidian-clipper) | MIT，5.3k★ | Obsidian 官方剪藏插件，模板/变量/高亮 | 可参考架构，可 fork |
| [kepano/defuddle](https://github.com/kepano/defuddle) | MIT，9.6k★ | 正文提取 + 转 Markdown，可在 content script 里跑；X 文章用 FxTwitter API | **直接当依赖用**（通用兜底） |
| [AidenXu-1/ZJ-clipper](https://github.com/AidenXu-1/ZJ-clipper) | ⚠️ 保留所有权利，仅个人使用 | 中文剪藏：飞书/B站/YouTube/小红书/X/公众号/Reddit/知乎，WXT + React + TS + Defuddle + Turndown，存 Obsidian 或飞书 | 和我们需求几乎一样，**可直接装来用/参考思路，但不能抄代码再分发** |

## X / 推特

| 项目 | 许可 | 说明 |
|---|---|---|
| [zendegani/XClipper](https://github.com/zendegani/XClipper) | PolyForm 非商用 | 质量最高：内容 AST、线程/引用/投票/长文、视频下载、批量导出书签/点赞；复用登录态调 X 内部 API |
| [jpmacieldasilva/tweet-2-obsidian](https://github.com/jpmacieldasilva/tweet-2-obsidian) | 待确认 | 推文/线程/长文 → Obsidian |
| [twoknow/x-article-saver](https://github.com/twoknow/x-article-saver) | 待确认 | X 帖子 + 网页文章 → Markdown |

## 小红书

| 项目 | 说明 |
|---|---|
| [zackzhangkai/xiaohongshu-chrome-plugin](https://github.com/zackzhangkai/xiaohongshu-chrome-plugin) | 插件 + 本地服务，手动采集图文到本地知识库 + Markdown 镜像（思路和我们最像） |
| [zhulin025/xiaohongshu-exporter](https://github.com/zhulin025/xiaohongshu-exporter) | 收藏夹批量导出到飞书/Notion/本地，断点续传 |
| [anupamme/xiaohongshu-content-collector](https://github.com/anupamme/xiaohongshu-content-collector) | 被动拦截接口数据采集 + AI 分析，带防风控 |

## 知乎

| 项目 | 许可 | 说明 |
|---|---|---|
| [wallechfox/download-zhihu](https://github.com/wallechfox/download-zhihu) | MIT | 文章/回答/问题/想法/收藏夹/专栏，initialData + DOM 双源，下载图片和评论 |
| [Tendo33/zhihu-md](https://github.com/Tendo33/zhihu-md) | — | LaTeX 公式还原、高清图 |
| [kscript/markdown-download](https://github.com/kscript/markdown-download) | — | 知乎/掘金/CSDN/公众号等多站 |

## Reddit

Reddit 最简单：任何帖子 URL 后加 `.json` 就能拿到帖子 + 评论树的结构化数据。

| 项目 | 说明 |
|---|---|
| [grigorkh/reddit-markdown-exporter](https://github.com/grigorkh/reddit-markdown-exporter) | 帖子 + 评论 → Markdown（树状/列表） |
| [farnots/RedditToMarkdown](https://github.com/farnots/RedditToMarkdown) | 同上，网页版 |

## 结论

1. 没有一个 MIT 许可、同时覆盖这四个平台的现成项目。ZJ-clipper 功能最接近，但许可不允许拿代码二次开发。
2. 推荐自己搭：**WXT（MV3）+ TypeScript**，每个平台一个 adapter，通用兜底用 **Defuddle**。各平台的抓取方法参考上面的 MIT 项目。
3. 抓取策略：优先读页面里已有的数据（X 拦截 GraphQL 响应、知乎 initialData、小红书 `__INITIAL_STATE__`、Reddit `.json`），DOM 解析只做兜底。这样比纯 DOM 稳，也不用额外 API key。

## 决策记录（2026-10-02）

- 存储：~~自己的服务器~~ → 改为存 **Obsidian**（见 design.md）。
- 决定自己做，设计见 [design.md](design.md)。
