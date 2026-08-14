# 规则语法参考

Legado 规则主要使用三种模式：**JSoup/CSS**（默认，HTML 页面）、**JsonPath**（JSON API）和 **JavaScript**（复杂逻辑）。另有 XPath（`/` 或 `@XPath:` 前缀）和 Regex（`:` 前缀，仅在 bookList/chapterList 等列表规则中生效）两种模式，极少用到。


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

### 索引

Legado 索引（推荐）：

```
div.item.0              → 第 1 个 div.item（全局结果）
div.item.2              → 第 3 个 div.item
div.item.-1             → 最后一个 div.item
div.item!0              → 排除第 1 个（即第 2 个起）
div.item!0:1            → 排除第 1、2 个
div.item[0:5]           → 索引 0~5 共 6 个（end 含端点，与 JsonPath 切片的 exclusive 不同）
div.item[3:]            → 第 4 个起
```


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
a:contains(下一页)               → 文本含"下一页"
div:matches(第\d+章)             → 匹配正则
p:containsOwn(作者)              → 自身文本（不含子元素）
```

### 结构伪类

```
div.item:first-child             → 首个子元素
div.item:last-child              → 末个子元素
div.item:nth-child(3)            → 第 3 个子元素
div:has(img)                     → 包含 <img>
div.item:not(.ad)                → 不含 class "ad"
```

`:has()` 和 `:not()` 可嵌套。

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

### bookList/chapterList 约束

`bookList`/`chapterList` 返回 N 个元素 = N 条结果。字段规则在每个元素内执行，只取首个匹配，无法跨越到兄弟元素。

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

`<js>` 返回对象数组 → 字段用 `$.xxx` 读取。

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

`bookList` 已是 JS 数组时，直接在 JS 里拼好完整 URL，字段用 `$.bookUrl` 直读。

## 3. 规则中的 JavaScript

三种嵌入方式，规则内写 JS 优先用 `@js:` / `<js>`：

| 形式 | 用途 | 示例 |
|---|---|---|
| `@js:...` | **推荐** — 可写在任意规则后，也可直接使用 | `@js:String(result).replace('a','b')` |
| `<js>...</js>` | **推荐** — 可写在任意两个规则中 | `<js>\n(function(){\n  var x = ...;\n  return x;\n})();\n</js>` |
| `{{...}}` | 仅 URL 内模板变量（`{{key}}`/`{{page}}`） | `https://x.com/search?q={{key}}&p={{page}}` |
> 无 DOM/Window/fetch 等 API

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

搜索/目录中字段需重新对齐时使用。

### `##` — 正则替换

```
div.title@text##\s+##
div.time@text##发布时间：(.*)##$1
div.author@text##作者：##
```

- 默认替换所有匹配
- 末尾加 `###` → 只替换首个

### 变量存储：`@put:` 和 `@get:`

```
@put:{varName:"rule"}规则文本
div.title@@get:{var}::after
```

作用域限于当前分析会话。

## 5. URL 构造

### 搜索 URL 模板

```
https://www.example.com/search?keyword={{key}}&page={{page}}
```

`{{key}}` 自动 URL 编码。`{{page}}` 从 1 开始递增。

### 多格式翻页 `<v1,v2,...>`

URL 中 `<a,b,c>` 按页码取值：第 1 页取 a、第 2 页取 b……超出取最后一个。用于首页与后续页 URL 格式不一致、或页码非简单递增的站点。

```
https://api.x.com/list?type=1&page=<1,2,3>   → 第1/2/3页取 1/2/3，第4页起固定 3
https://x.com/sort/1<,_2,_3>.html            → 第1页 /sort/1.html，第2页 /sort/1_2.html
```

### URL 选项

```
https://example.com/api,{"method":"POST","body":"q=搜索","headers":{"X-Key":"v"},"timeout":5000}
```

选项：`method` `body` `headers` `charset` `type` `webView` `webJs` `timeout` `retry` `followRedirects` `resolveIp` `js`

常用补充：
- `charset` — 表单/查询编码（非 UTF-8 站点写 `"gbk"` 等；特殊值 `"escape"` 用 %XX 转义）
- `type` — 强制响应类型（如图片走 byte/hex）
- `webJs` — 在 webView 内执行的 JS（配合 `"webView":true`）

### 图片请求头

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

执行时输入已是纯文本。非标准标签需加到 `|` 列表。

### `##` 语法对照

| 位置 | 形式 | 行为 |
|---|---|---|
| 规则后缀 | `选择器##p##r` | 对提取值替换 |
| 后缀+`###` | `选择器##p##r###` | 只替换首个 |
| `replaceRegex` | `##p##r` | 对整段输入替换 |

## 7. 其他模式

`/` 或 `@XPath:` 触发 XPath，`:` 前缀在列表规则（bookList/chapterList）中触发 Regex。极少用。

## 8. 站点模板

完整骨架见 [[site-templates.md]]。
