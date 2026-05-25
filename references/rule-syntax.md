# 规则语法参考

Legado 规则主要使用三种模式：**JSoup/CSS**（默认，HTML 页面）、**JsonPath**（JSON API）和 **JavaScript**（复杂逻辑）。另有 XPath（`//` 前缀）和 Regex（`:` 前缀）两种模式，极少用到。


## 1. JSoup/CSS 选择器（默认模式）

### 基本选择器

```
div#main > ul.list > li          → 直接子元素（>）
div.book-list .item              → 任意后代（空格）
h1.title, h2.subtitle            → 并集（逗号）
a[href*=novel]                   → href 属性包含 "novel" 字符串
a[href^=/book/]                  → href 以 /book/ 开头
a[href$=.html]                   → href 以 .html 结尾
a[href~=regex]                  → (JSoup特有) href 属性值匹配正则表达式（例：a[href~=(?i)chapter]）
```

### 索引（按位置筛选）

Legado 在 JSoup 之上提供了自己的索引语法糖，**在规则被送入 JSoup 之前预处理**。索引从 0 开始。

**Legado 索引语法（推荐）**：

```
div.item.0              → 第 1 个 div.item（全局结果）
div.item.2              → 第 3 个 div.item
div.item.-1             → 最后一个 div.item
div.item!0              → 排除第 1 个（即第 2 个起）
div.item!0:1            → 排除第 1、2 个
div.item[0:5]           → 前 5 个（索引 0~4）
div.item[3:]            → 第 4 个起
```

> **注意**：`:` 在 Legado 中只是分隔符。筛选索引用 `.数字`（如 `div.item.0`）。`div.item:1` 会原样传给 JSoup，不会按索引筛选。

**JSoup 原生索引**（基于同级兄弟位置）：

```
div.item:eq(0)          → 父元素下排第 1 个的 div.item（同级索引 0，等同 :first-child）
div.item:eq(2)          → 父元素下排第 3 个的 div.item
div.item:lt(3)          → 父元素下排前 3 个的 div.item
div.item:gt(2)          → 父元素下排第 4 个起的 div.item
```

`:eq/:lt/:gt` 按同级兄弟位置计算（非全局排名）。多数场景用 Legado 的 `.数字` 索引语法更直观。

### 文本匹配

```
a:contains(下一页)               → 文本含"下一页"的 <a>
div:matches(第\d+章)             → 文本匹配正则的 <div>
p:containsOwn(作者)              → 自身文本（不含子元素文本）含"作者"
```

### 结构伪类

```
div.item:first-child             → 父元素的首个子元素
div.item:last-child              → 父元素的末个子元素
div.item:nth-child(3)            → 父元素的第 3 个子元素（标准 CSS 规范，从 1 开始计）
div.item:nth-child(2n+1)         → 父元素的奇数子元素
div:has(img)                     → 包含 <img> 的元素
div:has(a[href])                 → 包含带 href 的 <a> 的元素
div.item:not(.ad)                → 不含 class "ad" 的 .item
```

> `:has()` 和 `:not()` 可嵌套：`li:has(a:contains(连载))` — 包含文本"连载"的链接的 li。

### 属性与内容提取

规则中**最后一个 `@`** 决定从匹配元素中提取什么：

| 后缀 | 返回内容 | 用途 |
|---|---|---|
| `@text` | 可见文本，空白已规范化 | 书名、标题、大多文字字段 |
| `@html` | 内部 HTML（已去 script/style） | 正文、带格式的描述 |
| `@all` | 外部 HTML（含元素本身） | 需要包装元素时 |
| `@ownText` | 元素自身文本，不含子元素 | 子元素有噪声时 |
| `@textNodes` | 所有文本节点，换行连接 | 极少用 |
| `@href` | `href` 属性 | 链接 |
| `@src` | `src` 属性 | 图片 |
| `@class` | `class` 属性 | 分类标签 |
| `@data-*` | 任意自定义属性 | 自定义数据属性 |

```
div.title@text          → "斗罗大陆"
a@href                  → "/novel/123.html"
img@src                 → "https://example.com/cover.jpg"
div#content@html        → "<p>第一章...</p><p>第二章...</p>"
```

### 关键：`bookList` / `chapterList` 约束

`bookList`（搜索）和 `chapterList`（目录）选择器决定**返回多少条结果**。Legado 引擎工作方式：

1. `getElements(bookList)` → 将页面切为 N 个元素
2. 对**每个**元素依次执行其他字段规则（`name`、`author`、`bookUrl`…）
3. `getString(rule)` 在每个元素内只返回**第一个**匹配

**结论：** `bookList` 必须返回**每个结果一个元素**。字段选择器只能访问该元素的**子元素**，无法跨越到兄弟元素。

```
bookList: "ul.list > li"          → N 个 <li> = N 条结果
name:     "h3.title@text"         → 在每个 <li> 内找 <h3 class="title">
author:   "span.author@text"      → 在每个 <li> 内找 <span class="author">
```

**兄弟元素布局**（如 `<dt>/<dd>`、`<div class="left">/<div class="right">` 等）：结果跨多个相邻元素，纯 JSoup/CSS 只能取一侧做 `bookList`。

*简单方案* — 接受缺失字段（详情页会补全）：

```
  bookList: "dl > dt"               → N 个 <dt> = N 条结果
  name:     "a:first-child@text"     → 从 dt 子元素
  author:   "a.zuozhe@text"          → 从 dt 子元素
  kind:     （在 <dd> 中，无法取到）  → 之后由 ruleBookInfo 补全
```

*进阶方案* — JS bookList 同时从两侧提取数据构建 NativeObject，字段规则用 `$.` 读取：

```js
// 通用模式：getElements 分别抓左右两侧，逐对拼合
const lefts = java.getElements("dl dt");    // 左侧元素列表
const rights = java.getElements("dl dd");   // 右侧元素列表
const books = [];
for (let i = 0; i < lefts.size(); i++) {
  books.push({
    name:    java.getString("a:first-child@text", lefts.get(i)),
    author:  java.getString("a.zuozhe@text", lefts.get(i)),
    bookUrl: java.getString("a:first-child@href", lefts.get(i)),
    kind:    java.getString("a:not(.new)@text", rights.get(i)),
    lastChapter: java.getString("a.new@text", rights.get(i)),
    updateTime: java.getString("i:first-child@text", rights.get(i))
  });
}
books;
```

```json
"name": "$.name",
"author": "$.author",
"bookUrl": "$.bookUrl",
"kind": "$.kind",
"lastChapter": "$.lastChapter",
"updateTime": "$.updateTime"
```

`<js>` 块返回 JS 对象数组 → Legado 的 `getElements` 将 `NativeArray` 展开为 `List<NativeObject>` → `setContent(item)` 将每个对象放入上下文 → `$.xxx` 以 JsonPath 模式读取属性。

## 2. JsonPath（JSON API）

用 `@Json:` 前缀或直接用 `$.` / `$[` 开头，引擎自动识别 JSON 模式。

```
$.data.books[*]                           → 数组中所有项
$.data.books[*].name                      → 提取每项的 name
$.data.books[0]                           → 第一项
$.data.books[?(@.status=='completed')]    → 按字段值过滤
$.data.books[-1]                          → 最后一项
$.data.totalPages                         → 标量值
$.data.chapters[0:10]                     → 切片前 10 项
$[0].items[*].title                       → 根为数组时
```

### 从 ID 构建 URL

API 返回 ID 而非完整 URL 时，用 `@js:` 拼接：

```json
"bookUrl": "@js:'https://www.example.com/book/' + result"
```

`@js:` 中的 `result` 是 JsonPath 提取到的原始值（如 ID 字符串），直接拼接即可。

> **更好的做法**：如果 `bookList` 已经是 JS 构建的 NativeObject 数组，直接在 JS 里拼好完整 URL（对象里加 `bookUrl`、`coverUrl` 等字段），规则用 `$.bookUrl` / `$.coverUrl` 直读。完全不需要在字段规则里写 `@js:` 或 `{{}}`。

## 3. 规则中的 JavaScript

三种嵌入方式，规则内写 JS 优先用 `@js:` / `<js>`：

| 形式 | 用途 | 示例 |
|---|---|---|
| `@js:...` | **推荐** — 可写在任意规则后，也可直接使用 | `@js:String(result).replace('a','b')` |
| `<js>...</js>` | **推荐** — 可写在任意两个规则中 | `<js>\n(function(){\n  var x = ...;\n  return x;\n})();\n</js>` |
| `{{...}}` | 仅 URL 内模板变量（`{{key}}`/`{{page}}`） | `https://x.com/search?q={{key}}&p={{page}}` |
> 无浏览器 DOM/Window/fetch 等 API

```
<js>
(()=>{
  if (page == 1) {
    var url = 'https://x.com/search,' + JSON.stringify({
      "method":"POST",
      "body":"keyword=" + key
    });
    return source.put('surl', String(java.connect(url).raw().request().url()));
  }
  return source.get('surl') + '&page=' + (page - 1);
})();
</js>
```

这是 POST 搜索后 302 跳转的标准应对模式。

### 其他规则字段中的 JS

CSS/JsonPath 表达不了时用 JS：

```json
"author": "@js:String(result).trim().replace('作者：','')"
"updateTime": "@js:java.timeFormat(java.connect(result).body())"
```

## 4. 运算符

规则按运算符拆分（从左到右，惰性求值）：

### `&&` — 并集

收集所有分支的结果：

```
div.title@text&&h1.title@text
```
→ 两个选择器的文本拼接为一个结果集。

### `||` — 回退

依次尝试各分支，取第一个非空结果：

```
h1.title@text||h2.title@text||title@text
```
→ 先试 h1，空则试 h2，再空则试 title 元素。

### `%%` — 归位/Zip

按位置索引将各分支结果配对：

```
div.name@text%%div.author@text%%div.time@text
```
→ result[0] = (name0, author0, time0)，result[1] = (name1, author1, time1)…

搜索/目录中不同字段来自 DOM 不同位置、需要重新对齐时最有用。

### `##` — 正则替换

在任意规则后追加 `##pattern##replacement` 对结果做后处理：

```
div.title@text##\s+##                     → 去掉所有空白
div.time@text##发布时间：(.*)##$1           → 提取捕获组
div.author@text##作者：##                   → 去掉前缀
```

语法：`rule##pattern##replacement`

- 默认：替换**所有**匹配 `pattern` 的地方为 `replacement`
- **提取首个匹配**：末尾加 `###`（三个 `#`）→ `rule##pattern##replacement###`。只返回第一个匹配并对其做替换（提取模式）

`##` 不可链式调用 — `ruleStr.split("##")[0]` 是实际规则，`[1]` 是正则，`[2]` 是替换值。如果替换值本身含 `##`，split 结果会出乎意料。

### 变量存储：`@put:` 和 `@get:`

从解析内容中存取值，供后续规则使用：

```
@put:{varName:"ruleString",varName2:"ruleString2"}规则文本
```

- `@put:{...}` 在规则求值前被剥离
- 每个键值对：键为变量名，值为在当前上下文中求值的规则字符串
- 后续规则中用 `@get:{varName}` 内联读取：

```
div.title@@get:{storedVar}::after
```

变量作用域限于当前分析会话（书籍信息、目录、正文）。适合提前抓取数据，在后续选择器中复用。

## 5. URL 构造

### 搜索 URL 模板

```
https://www.example.com/search?keyword={{key}}&page={{page}}
```

`{{key}}` 自动 URL 编码。`{{page}}` 随搜索翻页递增。

### URL 选项

在任何 URL 后追加 `,{json}` 设置请求参数：

```
https://example.com/api,{"method":"POST","body":"q=搜索","headers":{"X-Key":"v"},"timeout":5000}
```

完整选项：

```json
{
  "method": "GET",            // HTTP 方法
  "body": "a=1&b=2",          // 请求体
  "headers": {                // 额外请求头
    "User-Agent": "...",
    "Referer": "..."
  },
  "webView": true,            // WebView 加载（JS 渲染页面）
  "timeout": 5000,            // 超时毫秒，不设时走全局：connect 15s、read 60s
  "retry": 1,                 // 失败自动重试次数
  "followRedirects": false,   // 不跟随跳转，捕获重定向地址
  "resolveIp": "1.2.3.4",     // 覆盖 DNS 解析
  "js": "java.headerMap.put('X-Token','v')"  // 请求前执行的 JS
}
```

常见示例 — POST 表单搜索：
```
https://x.com/search,{"method":"POST","body":"keyword={{key}}","headers":{"Content-Type":"application/x-www-form-urlencoded"}}
```

### 图片请求头

图片也可通过 URL 选项携带自己的请求头：

```js
let opts = {"headers": {"Referer": baseUrl}};
'<img src="' + src + ',' + JSON.stringify(opts) + '">'
```

## 6. replaceRegex 格式

`ruleContent` 的 `replaceRegex` 字段用于正文全文替换。**它整体被当成一条规则字符串**喂给 `AnalyzeRule.getString`，引擎按 `##` 切片解析为最多 4 段：

```
##正则pattern##替换文本###
└┬┘└────┬────┘└──┬──┘└┬┘
 │      │       │    └─ 末尾再多一个 #：只替换首个匹配
 │      │       └────── 替换文本，缺省 = 空串
 │      └────────────── 正则 pattern
 └───────────────────── 前缀 ##，规则本体段为空（表示对整段输入做替换）
```

### 多个清理模式合并到同一个正则

`|` 是正则元字符（"或"），用它把多个 alternatives 合并到同一条规则里，统一替换为空（替换文本缺省）：

```
##\s{2,}|&nbsp;|.*最新章节.*|.*请收藏.*
```

### 带替换文本

```
##发布时间：(.*)##$1                  → 提取捕获组，替换整段为捕获内容
##(<p[^>]*>)|(</p>)##\n                → 把 <p>/</p> 换成换行
```

### 使用要点

- 执行时输入已是纯文本（HTML 由 `@html` 转换处理）— 针对的是文本噪声，不是 HTML 标签
- 非标准标签（`<amp-img>`、`<mip-*>`）转换器可能按字面残留 → 加 `|</?amp-[^>]*>|</?mip-[^>]*>` 到 `|` 列表
- 逐步编写 — 先看正文输出，再针对实际噪声补 alternatives

### 规则内 `##` 语法（不同位置，同一套语法）

| 位置 | 形式 | 行为 |
|---|---|---|
| **选择器规则后缀** | `选择器##pattern##replacement` | 对提取值做正则替换 |
| **末尾再加一个 `#`** | `选择器##pattern##replacement###` | 只替换首个匹配（提取模式） |
| **`replaceRegex` 字段** | `##pattern##replacement` | 同上语法，但**规则本体段为空** = 对整段输入替换；replacement 通常省 |

## 7. 其他模式（简述）

存在但几乎不该用：

**XPath** — 规则以 `//` 或 `@XPath:` 开头时触发。适合基于文本的选择（`text()='作者'`）或兄弟元素遍历。但 CSS 选择器能处理绝大多数场景，剩下由 JS 兜底。

**Regex 列表模式** — 列表规则（`bookList`、`chapterList`）以 `:` 前缀触发。用正则捕获组从原始 HTML 提取列表项。CSS 选择器几乎总是更好的选择。

## 8. URL 构造完整示例

完整 JSON 骨架和调整说明见 [[references/site-templates.md]]，涵盖 HTML 文本站（笔趣阁式）、JSON API 站、需登录站、漫画站四种类型。
