# 站点骨架样板

按站点类型挑一个最接近的起手，再按 [[../SKILL]] 工作流逐步实测增量。

四类样板：

1. [HTML 文本站（笔趣阁式）](#1-html-文本站笔趣阁式)
2. [JSON API 站](#2-json-api-站)
3. [需登录站](#3-需登录站)
4. [漫画站（图片源）](#4-漫画站图片源)

---

## 1. HTML 文本站（笔趣阁式）

典型特征：搜索是 GET，返回 HTML 列表；详情、目录、正文都是 HTML 页面。

```json
{
  "bookSourceUrl": "https://www.example.com",
  "bookSourceName": "示例小说站",
  "bookSourceType": 0,
  "enabled": true,
  "enabledExplore": true,
  "enabledCookieJar": true,
  "concurrentRate": "1000",
  "header": "{\"User-Agent\": \"Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36\"}",

  "searchUrl": "https://www.example.com/search?keyword={{key}}&page={{page}}",
  "ruleSearch": {
    "checkKeyWord": "斗罗大陆",
    "bookList": "div.result-list > div.result-item",
    "name": "h3.title > a@text",
    "author": "p.info > span.author@text",
    "bookUrl": "h3.title > a@href",
    "coverUrl": "img.cover@src",
    "kind": "p.info > span.kind@text",
    "lastChapter": "p.info > a.latest@text",
    "intro": "p.intro@text"
  },

  "ruleBookInfo": {
    "name": "div#info > h1@text",
    "author": "div#info > p:nth-child(2)@text##作者：##",
    "intro": "div#intro@html",
    "coverUrl": "div#fmimg > img@src",
    "kind": "div#info > p:nth-child(3)@text##分类：##",
    "lastChapter": "div#info > p:nth-child(4) > a@text",
    "tocUrl": "div#list > a.more@href"
  },

  "ruleToc": {
    "chapterList": "div#list > dl > dd",
    "chapterName": "a@text",
    "chapterUrl": "a@href",
    "nextTocUrl": "div.page_link > a:contains(下一页)@href"
  },

  "ruleContent": {
    "content": "div#content@html",
    "nextContentUrl": "div.page_link > a:contains(下一页)@href",
    "replaceRegex": "##\\s{2,}|&nbsp;|.*记住本站.*|.*一秒记住.*"
  }
}
```

调整点：
- 若搜索是 POST：`searchUrl` 末尾加 `,{"method":"POST","body":"keyword={{key}}"}`
- 若目录在详情页本页：去掉 `tocUrl`
- 若不分页：`searchUrl` 去掉 `&page={{page}}`，`nextTocUrl` / `nextContentUrl` 留空

---

## 2. JSON API 站

典型特征：Playwright Network 看到 XHR 返回 JSON。比 HTML 反爬弱、字段干净。

```json
{
  "bookSourceUrl": "https://api.example.com",
  "bookSourceName": "示例 API 站",
  "bookSourceType": 0,
  "enabled": true,
  "enabledCookieJar": true,
  "concurrentRate": "500",
  "header": "{\"User-Agent\": \"Mozilla/5.0\", \"Accept\": \"application/json\"}",

  "searchUrl": "https://api.example.com/v1/search?q={{key}}&page={{page}}&size=20",
  "ruleSearch": {
    "checkKeyWord": "斗罗大陆",
    "bookList": "$.data.list[*]",
    "name": "$.title",
    "author": "$.author",
    "bookUrl": "@js:'https://api.example.com/v1/book/' + result",
    "coverUrl": "$.cover",
    "kind": "$.category",
    "intro": "$.summary",
    "lastChapter": "$.latest_chapter",
    "wordCount": "$.word_count"
  },

  "ruleBookInfo": {
    "init": "",
    "name": "$.data.title",
    "author": "$.data.author",
    "intro": "$.data.summary",
    "coverUrl": "$.data.cover",
    "kind": "$.data.category",
    "lastChapter": "$.data.latest_chapter",
    "tocUrl": "@js:'https://api.example.com/v1/book/' + book.bookUrl.split('/').pop() + '/chapters'"
  },

  "ruleToc": {
    "chapterList": "$.data.chapters[*]",
    "chapterName": "$.title",
    "chapterUrl": "@js:'https://api.example.com/v1/chapter/' + result"
  },

  "ruleContent": {
    "content": "$.data.content"
  }
}
```

> **更好的写法**：`bookList` 用 `<js>` 块拼好完整对象（带完整 URL），字段全用 `$.bookUrl` / `$.coverUrl` 直读，避免每个字段写 `@js:` 拼接。见 [[rule-syntax]] §bookList 进阶。

---

## 3. 需登录站

典型特征：搜索/详情/正文需登录 cookie。`loginUi` 写表单，`loginCheckJs` 每次请求后验证。

```json
{
  "bookSourceUrl": "https://www.example.com",
  "bookSourceName": "示例登录站",
  "bookSourceType": 0,
  "enabled": true,
  "enabledCookieJar": true,
  "concurrentRate": "1000",
  "header": "{\"User-Agent\": \"Mozilla/5.0\"}",

  "loginUrl": "https://www.example.com/login,{\"method\":\"POST\",\"body\":\"username={{username}}&password={{password}}\"}",
  "loginUi": "[{\"name\":\"username\",\"type\":\"text\"},{\"name\":\"password\",\"type\":\"password\"}]",
  "loginCheckJs": "(() => { let res = result; if (String(res.body()).includes('请先登录')) { source.removeLoginInfo(); java.toast('登录已过期，请重新登录'); } return res; })()",

  "searchUrl": "https://www.example.com/search?q={{key}}",
  "ruleSearch": {
    "bookList": "div.book-list > div.book-item",
    "name": "h3 > a@text",
    "author": "span.author@text",
    "bookUrl": "h3 > a@href"
  }
}
```

要点：
- `loginUi` 是 JSON 字符串数组（不是 JSON 对象），定义表单字段。完整字段类型见 BaseSource 源码
- `loginCheckJs` 是 IIFE，必须 `return res`（StrResponse 类型）
- 触发重登：`source.removeLoginInfo()` + `java.toast` 提示

CloudFlare 站点的 `loginCheckJs` 模板见 [[anti-bot]]。

---

## 4. 漫画站（图片源）

典型特征：`bookSourceType: 2`，正文是 `<img>` 标签序列，每张图可能需 Referer。

```json
{
  "bookSourceUrl": "https://manga.example.com",
  "bookSourceName": "示例漫画站",
  "bookSourceType": 2,
  "enabled": true,
  "enabledCookieJar": true,
  "concurrentRate": "1000",
  "header": "{\"User-Agent\": \"Mozilla/5.0\"}",

  "searchUrl": "https://manga.example.com/search?q={{key}}",
  "ruleSearch": {
    "bookList": "div.manga-list > div.item",
    "name": "h3@text",
    "author": "span.author@text",
    "bookUrl": "a@href",
    "coverUrl": "img@src"
  },

  "ruleBookInfo": {
    "name": "h1@text",
    "author": "p.author@text",
    "intro": "div.summary@html",
    "coverUrl": "img.cover@src"
  },

  "ruleToc": {
    "chapterList": "ul.chapter-list > li",
    "chapterName": "a@text",
    "chapterUrl": "a@href"
  },

  "ruleContent": {
    "content": "<js>\n(() => {\n  const refOpt = JSON.stringify({headers: {Referer: baseUrl}});\n  const imgs = java.getStringList('div.images > img@src');\n  return imgs.map(src => '<img src=\"' + src + ',' + refOpt + '\">').join('');\n})()\n</js>"
  }
}
```

要点：
- 正文构造 `<img>` 标签序列。每张图 URL 后拼 `,{"headers":{"Referer":"..."}}` 自带请求头
- 加密图片：用 `imageDecode` 字段写 AES/XOR 解密 JS，见 [[js-api]] §AES/XOR 图片解密
- 字体反爬不适用（漫画无文本）

---

## 关于"发现"页（`exploreUrl`）

四类骨架都可加发现页。`exploreUrl` 格式 `分类名::URL`，一行一条：

```
"exploreUrl": "玄幻::https://www.example.com/category/xuanhuan?page={{page}}\n都市::https://www.example.com/category/dushi?page={{page}}\n完结::https://www.example.com/finished?page={{page}}"
```

`ruleExplore` 与 `ruleSearch` 结构相同（`bookList`、`name`、`author`、`bookUrl` 等）。**如果与 `ruleSearch` 完全一致，可省略 `ruleExplore`**；只要有一项不同，就必须写完整。
