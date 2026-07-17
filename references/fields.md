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
| `concurrentRate` |  | 字符串。`"1000"`=每次请求间隔 ≥1s（最小间隔模式）；`"N/M"`=每 M 毫秒最多 N 次（如 `"3/1000"`）；`"0"`/空=不限流。单次限流优先写 `"1000"` 而非 `"1/1000"`（后者走计数窗口逻辑，效果相近但非同一路径） |
| `bookUrlPattern` |  | 详情页 URL 正则（外部链接识别） |
| `jsLib` |  | 共享 JS 库（多规则复用函数），**无 java/cache/cookie 等全局变量，用 this 解构** |
| `loginUrl` / `loginUi` / `loginCheckJs` |  | 登录三件套，见 [[references/anti-bot.md]] |
| `coverDecodeJs` |  | 封面解密 JS：`result`=封面 InputStream、`src`=图片 URL，须返回 ByteArray。见 [[references/js-api.md]] §封面解密 |
| `variableComment` |  | 自定义变量说明（变量设置 UI 显示） |
| `exploreScreen` |  | 发现页筛选规则（动态筛选条件） |
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
  "title": "",
  "nextContentUrl": "div.page_link a@href",
  "replaceRegex": "##\\s{2,}|&nbsp;",
  "webJs": "",
  "sourceRegex": "",
  "imageDecode": "",
  "payAction": "",
  "imageStyle": "",
  "callBackJs": "",
}
```

- 正文用 `@html`，`@text` 会丢换行
- 漫画源输出 `<img src="...">` 序列
- `replaceRegex`：`##正则##替换`，多个模式用 `|` 合并

## 翻页字段

`nextTocUrl`/`nextContentUrl`：返回非空继续，空则停止。末页必须返回空否则死循环。

## 发现 `ruleExplore` + `exploreUrl`

`exploreUrl` 两种形态（引擎按内容自动识别）：

- **文本行**：`名称::url`，条目间换行或 `&&` 分隔；只写名称不带 `::url` 的行是分区头。
- **JSON 数组**：每项一个分类条目对象，可带 `style` 网格样式；用 `<js>` 生成则可动态抓
  站点分类、加分区头（生成结果缓存，管理页"清除发现缓存"后重算）。

JSON 条目字段：

| 字段 | 必填 | 说明 |
|------|------|------|
| `title` | ✓ | 分类显示名。分区头可用装饰字符如 `▱▱▱▱男生▱▱▱▱` |
| `url` |  | 分类页 URL，支持 `{{page}}`、`<page1,page2>`、URL 选项（POST/headers/webView）。分区头可不传 |
| `style` |  | Yoga Layout 样式，**值均为字符串**。分区头用 `{"layout_flexBasisPercent":"1"}` 占满整行；子分类用 `{"layout_flexBasisPercent":"0.25","layout_flexGrow":"1"}` 四列自适应 |

`ruleExplore` 结构与 `ruleSearch` **完全相同**，仅无 `checkKeyWord`。若 `ruleExplore.bookList` 为空，引擎自动回退使用 `ruleSearch`。

### 固定分类（JS 返回字面数组）

```js
<js>JSON.stringify([
  {title:'玄幻', url:'https://x.com/sort/1/<1,2,3>'},
  {title:'都市', url:'https://x.com/sort/2/<1,2,3>'}
])</js>
```

### 动态分类（抓站点分类 + 分区头 + style）

```js
// 动态抓分类，区分区头(占满行)和子项(四列)
let src = org.jsoup.Jsoup.parse(java.ajax('https://www.qidian.com/all/'));
let list = [];
let addItem = (title, url, flexBasis) => {
  list.push({ title, url, style: { layout_flexGrow: '1', layout_flexBasisPercent: flexBasis } });
};
addItem('▱▱▱▱男生▱▱▱▱', null, '1');                 // 分区头：100% 宽
src.select('.type-filter').get(1).select('a').forEach(el => {
  addItem(el.text(), 'https:' + el.attr('href'), '0.25'); // 子分类：25% 宽，4列
});
JSON.stringify(list);
```
