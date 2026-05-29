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
| JSON 数组 | `[{"title":"玄幻","url":"https://x.com/xh"}]` | 通用 |
| JS 生成 | `<js>...</js>` 返回 JSON 数组字符串 | 分类需动态抓取、带分区头、带 style |
| 文本格式（旧） | `玄幻::https://x.com/xh&&都市::https://x.com/ds` | 简单站点，快速手写 |

每个条目字段：

| 字段 | 必填 | 说明 |
|------|------|------|
| `title` | ✓ | 分类显示名。分区头可用装饰字符如 `▱▱▱▱男生▱▱▱▱` |
| `url` |  | 分类页 URL。分区头可不传 |
| `style` |  | Yoga Layout 样式，**值均为字符串**。分区头用 `{"layout_flexBasisPercent":"1"}` 占满整行；子分类用 `{"layout_flexBasisPercent":"0.25","layout_flexGrow":"1"}` 四列自适应 |

`exploreUrl` 中的每个 URL 跟 `searchUrl` 一样支持 `{{page}}`、`<page1,page2>`、URL 选项（POST/headers/webView）。

`ruleExplore` 结构与 `ruleSearch` **完全相同**，仅无 `checkKeyWord`。若 `ruleExplore.bookList` 为空，引擎自动回退使用 `ruleSearch`。

### 动态发现示例（JS 生成 + 分区头 + style）

```js
// exploreUrl 用 <js> 动态抓分类，区分区头(占满行)和子项(四列)
let src = org.jsoup.Jsoup.parse(java.ajax('https://www.qidian.com/all/'));
let list = [];
let addItem = (title, url, flexBasis) => {
  list.push({ title, url, style: { layout_flexGrow: '1', layout_flexBasisPercent: flexBasis } });
};

// 分区头：flexBasis = '1' (100%宽度)
addItem('▱▱▱▱男生▱▱▱▱', null, '1');
// 子分类：flexBasis = '0.25' (25%宽度，4列)
src.select('.type-filter').get(1).select('a').forEach(el => {
  addItem(el.text(), 'https:' + el.attr('href'), '0.25');
});
JSON.stringify(list);
```
