# 纯JS单文件书源（仅本 fork）

一个 `.js` 文件即一个完整书源：顶层为一个 `source` 配置对象与若干 `function` 声明，声明即生效。
`search` / `getChapters` / `getContent` 必备（缺失在导入/保存时报错），`getBookInfo` 可选。
交付物是 `.js` 文件，用户在源管理页"新建JS源"粘贴，或直接导入 `.js` 文件/直链。

引擎侧事实源：`JsSourceConfig`（提取校验）、`JsSourceEngine`（调用）、`JsSourceMarshaller`（返回值落库）。
App 内置模板：`app/src/main/assets/js_source_template.js`（含 JSDoc typedef，可直接作起手骨架）。

## 骨架

```js
const source = {
  bookSourceUrl: "https://example.com", // 必填,主键;修改即成为新源
  bookSourceName: "示例JS源",           // 必填
  bookSourceType: 0,                    // 0文本 1音频 2图片 3下载站
  lastUpdateTime: 0                     // 版本时间戳,重复导入按此判断新旧
}

function search(key, page) { /* 返回 SearchBook[] */ }
function getBookInfo(book) { /* 可选,返回覆盖字段对象 */ }
function getChapters(book) { /* 返回 Chapter[] */ }
function getContent(chapter, book) { /* 返回正文字符串 */ }
```

## source 配置

键名与 BookSource 实体字段逐字对应（GSON 直转）。常用可选键：
`header`（JSON 字符串）、`loginUrl`/`loginUi`/`loginCheckJs`（登录，同声明式）、
`concurrentRate`、`enabledCookieJar`、`jsLib`（本源所有函数共用的库文本）、
`bookSourceGroup`、`bookSourceComment`、`variableComment`。

- `enabled`/`customOrder` 等用户态字段由应用维护，脚本值不生效。
- `mainJs` 与六个 `rule*` 字段在提取时剥除。
- JS 源无发现页；校验书源时发现检查自动跳过。

## 四函数契约

| 函数 | 入参 | 返回 |
|---|---|---|
| `search(key, page)` | 搜索词；页码从 1 起 | `SearchBook[]` |
| `getBookInfo(book)` | 书籍对象（已含 search 阶段字段） | 覆盖字段对象 |
| `getChapters(book)` | 书籍对象 | `Chapter[]`，数组序即目录序 |
| `getContent(chapter, book)` | 章节、书籍对象；另有绑定 `nextChapterUrl`（可能 null） | 正文字符串，空即失败 |

返回数组/对象或 `JSON.stringify` 字符串均可（引擎收字符串直接解析，收对象自动转 JSON）。

**SearchBook**：`name`、`bookUrl` 必填，缺失的条目被丢弃；`bookUrl`/`tocUrl` 需绝对地址
（search 结果不做相对补全）。可选 `author`/`kind`（逗号分隔）/`coverUrl`/`intro`/
`wordCount`（字符串）/`latestChapterTitle`/`tocUrl`/`type`。`origin` 系字段由应用注入。

**getBookInfo 覆盖白名单**：`name`/`author`/`intro`/`coverUrl`/`kind`/`wordCount`/
`latestChapterTitle`/`tocUrl`/`type`/`variable`，只有写出的键才覆盖，其余键忽略。
`tocUrl` 缺省用 `book.bookUrl`；`variable` 值须是 JSON 字符串（`'{"k":"v"}'`）。

**Chapter**：`title`、`url` 必填，缺失的条目被丢弃；相对 `url` 按 `book.tocUrl` 补全。
分卷行：`isVolume: true` 且 `url` 与 `title` 相同，不抓正文。可选 `isVip`/`isPay`/
`wordCount`/`tag`/`resourceUrl`（音频真实地址）。`index` 由应用按数组序注入。

**type 位值**（`search`/`getBookInfo` 均可覆写）：文本 8、音频 32、图片 64、下载 128；
与 `bookSourceType` 的 0-3 是两套取值。

## 运行环境（与规则内嵌 JS 的差异）

- `java` = JsExtensions：网络（ajax/ajaxAll/connect/get/head/post/webView 族/
  startBrowserAwait）、编解码（base64/hex/encodeURI/timeFormat）、加解密
  （md5Encode/digestHex/createSymmetricCrypto 族，CryptoJS 亦可用）、文件
  （downloadFile/cacheFile/unzipFile 族）、字体（queryTTF/replaceFont）、并发
  （singleFlight/lock/tick）、调试（log/logType/toast）。
  **AnalyzeRule/AnalyzeUrl 函数不在此上下文**：`java.getString`、`java.getElements`、
  `java.setContent`、`java.put`、单参 `java.get(key)`、`java.reGetBook`、
  `java.refreshTocUrl`、`java.initUrl`、`java.getStrResponse` 不可用。
- **HTML 解析用 Jsoup 直调**（锚 `JsTest.jsoupFromJsScope`）：
  ```js
  const doc = org.jsoup.Jsoup.parse(html)
  for (const el of doc.select("div.item")) {
    list.push({ name: el.select("a.title").text(), bookUrl: el.select("a").attr("abs:href") })
  }
  ```
  JSON API 用 `JSON.parse(java.ajax(url))`。
- **字符串两型**（2026-07-17 探针锚定 `JsTest.javaStringInteropBoundary`）：`key`/`baseUrl` 等
  裸绑定参数是 JS 原生字符串；经成员访问取得的字符串（`book.bookUrl`/`chapter.url`、
  Jsoup `.text()`/`.attr()`、`java.ajax()` 等返回值）是 Java 包装对象——`typeof` 为 object、
  `.length` 是方法、空串为真值、与同文本 JS 字符串 `===` 不等；同名 Java 方法优先分派
  （正则 `replace` 重载歧义报错、`split` 走 Java 语义），未被遮蔽的名字（`match` 等）回落
  String.prototype。用 JS 字符串能力与判空前先 `String(...)` 归一化：
  `String(book.bookUrl).replace(/\/+$/, "")`；拼接、模板字符串、传 Java 方法参数、
  作返回对象字段值（`JSON.stringify` 自动解包）直接用。
- 绑定 `source`/`cookie`/`cache`/`baseUrl` 可直接使用；函数参数同时是同名绑定。
  `jsLib` 内函数取不到调用方绑定，依赖经参数传入或 `this` 解构（同 [[js-api.md]] jsLib 契约）。
- 每次调用在新 scope 执行主脚本，顶层变量不跨调用保留；跨请求状态存
  `cache.put/get` 或 `source.setVariable/getVariable`。
- ES6 边界同规则 JS，见 [[js-api.md]] §ES6+ 兼容性。

## Phase 4 → mainJs 迁移映射

verify.js（node）验证过的逻辑逐行迁移：

| verify.js | mainJs |
|---|---|
| `fetch(url)` + await | `java.ajax(url)`（同步） |
| `cheerio.load(html)` / `$('a').text()` | `org.jsoup.Jsoup.parse(html)` / `.select('a').text()` |
| `crypto-js` | `CryptoJS.*` 或 `java.createSymmetricCrypto` 族 |
| `new URL(rel, base)` | 章节相对 url 交给应用补全；其余 `java.toURL(rel, base)` |
| 字符串链式操作 `str.replace(/re/, ...)` 等 | Java 来源值（`book.*`、Jsoup、`java.ajax()` 返回）先 `String(...)` 再链 |

## 校验

```bash
node scripts/validate-jssource.js path/to/source.js
```

检查：整文件语法（`vm.Script`）、Rhino 不兼容语法、`java.*` 是否在 JsExtensions 面内、
`source` 必填键与类型、三个必备函数存在、剥除键/用户态键提示。
