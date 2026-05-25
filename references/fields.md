# 字段速查

完整字段清单。SKILL.md 给出顶层框架后，写每类规则时来这里查具体字段名和示例。

## BookSource 顶层

| 字段 | 必填 | 说明 |
|---|---|---|
| `bookSourceUrl` | ✓ | **主键**，改了即新书源 |
| `bookSourceName` | ✓ | 显示名 |
| `bookSourceType` | ✓ | `0`=文本 `1`=音频 `2`=图片 `3`=文件 |
| `enabled` |  | 默认 true |
| `enabledExplore` |  | 开启"发现"页 |
| `enabledCookieJar` |  | 登录/session 站点需 true |
| `header` |  | 全局请求头 JSON 字符串 |
| `concurrentRate` |  | 请求间隔，直接写毫秒数：`"1000"`=每次请求间隔 ≥1s。`"N/M"` 格式仅在 N>1 时使用（如 `"3/1000"`=每 1 秒最多 3 次）。**不要写 `"1/1000"`**，等同于 `"1000"` |
| `bookUrlPattern` |  | 详情页 URL 正则（外部链接识别） |
| `jsLib` |  | 共享 JS 库（多规则复用函数） |
| `loginUrl` / `loginUi` / `loginCheckJs` |  | 登录三件套，见 [[references/anti-bot.md]] |
| `coverDecodeJs` |  | 封面解密 JS |
| `eventListener` + `customButton` |  | 事件回调，见 [[references/js-api.md]] §callBackJs |
| `ruleExplore` + `exploreUrl` |  | 发现页规则 |
| `ruleSearch` / `ruleBookInfo` / `ruleToc` / `ruleContent` | ✓ | 四类规则对象，见下文 |

## 搜索 `ruleSearch`

```json
{
  "checkKeyWord": "斗罗大陆",
  "bookList": "div.search-list > ul > li",
  "name": "span.title@text",
  "author": "span.author@text",
  "bookUrl": "a@href",
  "coverUrl": "img@src",
  "kind": "...",
  "lastChapter": "...",
  "updateTime": "...",
  "wordCount": "...",
  "intro": "..."
}
```

`searchUrl` 模板：`{{key}}` 自动 URL 编码，`{{page}}` 页码递增。

`bookList` 必须返回 N 个元素 = N 条结果。字段规则只在每个元素子树内搜，且只取首个匹配。详见 [[references/rule-syntax.md]] §bookList 约束。

## 详情 `ruleBookInfo`

```json
{
  "init": "",
  "name": "...",
  "author": "...@text##作者：##",
  "intro": "div#intro@html",
  "coverUrl": "...",
  "kind": "...",
  "lastChapter": "...",
  "tocUrl": "...",
  "wordCount": "...",
  "updateTime": "...",
  "canReName": "",
  "downloadUrls": ""
}
```

- `init` 是预处理 JS，**必须返回 result**（否则后续字段拿不到内容）
- `tocUrl` 仅当目录在独立页面时需要

## 目录 `ruleToc`

```json
{
  "chapterList": "div#list > dl > dd",
  "chapterName": "a@text",
  "chapterUrl": "a@href",
  "nextTocUrl": "div.page_link a@href",
  "isVip": "...",
  "isPay": "...",
  "isVolume": "...",
  "preUpdateJs": "",
  "formatJs": "",
  "updateTime": ""
}
```

`preUpdateJs` 可调用 `java.refreshTocUrl()` / `java.reGetBook()`（仅此上下文可用，见 [[references/js-api.md]]）。

## 正文 `ruleContent`

```json
{
  "content": "div#content@html",
  "nextContentUrl": "div.page_link a@href",
  "replaceRegex": "##\\s{2,}|&nbsp;",
  "webJs": "",
  "sourceRegex": "",
  "imageDecode": "",
  "payAction": "",
  "imageStyle": "",
  "callBackJs": ""
}
```

- 正文用 `@html`，保留段落结构；`@text` 会丢换行
- 漫画源输出 `<img src="...">` 标签序列
- `replaceRegex`：以 `##` 开头，后接一条正则；多个替换模式用 `|`（正则的"或"）合并到同一条正则里，统一替换为空。详细机制见 [[references/rule-syntax.md]] §replaceRegex

## 翻页字段

`nextTocUrl`（目录翻页）和 `nextContentUrl`（正文翻页）机制一致：

- 选择器返回非空 URL → 继续翻页；返回空 → 停止
- 可返回列表，Legado 自动去重
- 末页选择器必须返回空，否则 App 死循环
- 验证方法：用 Playwright 打开非末页和末页两种章节各跑一遍，确认非末页有 URL、末页空
