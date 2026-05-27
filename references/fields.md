# 字段速查

完整字段清单。

## BookSource 顶层

| 字段 | 必填 | 说明 |
|---|---|---|
| `bookSourceUrl` | ✓ | **主键**，改了即新书源 |
| `bookSourceName` | ✓ | 显示名 |
| `bookSourceType` | ✓ | `0`=文本 `1`=音频 `2`=图片 `3`=文件 |
| `bookSourceComment` |  | 用户备注 |
| `enabled` |  | 默认 true |
| `enabledExplore` |  | 开启"发现"页 |
| `enabledCookieJar` |  | 登录/session 站点需 true |
| `header` |  | 全局请求头 JSON 字符串 |
| `concurrentRate` |  | 请求间隔，直接写毫秒数：`"1000"`=每次请求间隔 ≥1s。`"N/M"` 格式仅在 N>1 时使用（如 `"3/1000"`=每 1 秒最多 3 次）。**不要写 `"1/1000"`**，等同于 `"1000"` |
| `bookUrlPattern` |  | 详情页 URL 正则（外部链接识别） |
| `jsLib` |  | 共享 JS 库（多规则复用函数），**无 java/cache/cookie 等全局变量，用 this 解构** |
| `loginUrl` / `loginUi` / `loginCheckJs` |  | 登录三件套，见 [[references/anti-bot.md]] |
| `coverDecodeJs` |  | 封面解密 JS |
| `eventListener` + `customButton` |  | 事件回调，见 [[references/js-api.md]] §callBackJs |
| `ruleExplore` + `exploreUrl` |  | 发现页，详见下文 §发现 |
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

`bookList` 返回 N 个元素 = N 条结果，字段在每个元素内执行。

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

- `init` 必须返回 `result`
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

`preUpdateJs` 可调用 `java.refreshTocUrl()` / `java.reGetBook()`。

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

- 正文用 `@html`，`@text` 会丢换行
- 漫画源输出 `<img src="...">` 序列
- `replaceRegex`：`##正则##替换`，多个模式用 `|` 合并

## 翻页字段

`nextTocUrl`/`nextContentUrl`：返回非空继续，空则停止。末页必须返回空否则死循环。

## 发现 `ruleExplore` + `exploreUrl`

`exploreUrl` 定义分类入口，有三种写法：

| 格式 | 示例 | 适用场景 |
|------|------|----------|
| JSON 数组（推荐） | `[{"title":"玄幻","url":"https://x.com/xh"},{"title":"都市","url":"https://x.com/ds"}]` | 通用，最可靠 |
| JS 生成 | `<js>[{title:"玄幻",url:"https://x.com/xh"}]</js>` | 分类需动态抓取 |
| 文本格式（旧） | `玄幻::https://x.com/xh&&都市::https://x.com/ds` | 简单站点，快速手写 |

`exploreUrl` 中的每个 URL 跟 `searchUrl` 一样支持 `{{page}}`、`<page1,page2>`、URL 选项（POST/headers/webView）。

`ruleExplore` 结构与 `ruleSearch` **完全相同**（bookList、name、author、bookUrl 等 10 个字段），仅无 `checkKeyWord`。**关键行为：如果 `ruleExplore.bookList` 为空，引擎自动回退使用 `ruleSearch`。** 搜索结果和发现结果结构一致时，只写 `exploreUrl` + `enabledExplore: true` 即可。

```json
{
  "enabledExplore": true,
  "exploreUrl": "[{\"title\":\"玄幻\",\"url\":\"https://www.example.com/sort/1/<1,2,3>\"},{\"title\":\"都市\",\"url\":\"https://www.example.com/sort/2/<1,2,3>\"}]",
  "ruleExplore": {
    "bookList": "div.result-list > div.item",
    "name": "h3.title@text",
    "author": "span.author@text",
    "bookUrl": "a@href",
    "coverUrl": "img@src"
  }
}
```

发现结果分页可用 `<page1,page2,page3>` 模式，每次加载页号递增。上例中 sort/1/1、sort/1/2、sort/1/3 依次请求，超出后用最后一个值。
