# 站点骨架

按类型起手，按 [[SKILL.md]] 工作流实测。

1. [HTML 文本站](#1-html-文本站)
2. [JSON API 站](#2-json-api-站)
3. [需登录站](#3-需登录站)
4. [漫画站](#4-漫画站)

---

## 1. HTML 文本站

搜索 GET，返回 HTML 列表；详情/目录/正文都是 HTML。

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

XHR 返回 JSON，反爬弱。

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

`bookList` 用 JS 拼好对象，字段用 `$.xxx` 直读。

---

## 3. 需登录站

需登录 cookie。`loginUi` 写表单，`loginCheckJs` 验证。

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
- `loginUi` 是 JSON 字符串数组
- `loginCheckJs` 必须返回 `StrResponse`
- 重登：`source.removeLoginInfo()` + `java.toast`

CF 模板见 [[references/anti-bot.md]]。

---

## 4. 漫画站

`bookSourceType: 2`，正文是 `<img>` 序列。

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
- 正文构造 `<img>` 序列，URL 后拼 `,{"headers":{"Referer":"..."}}`
- 加密图片用 `imageDecode`，见 [[references/js-api.md]]

---

## 发现页（`exploreUrl`）

格式 `分类名::URL`，一行一条。`ruleExplore` 与 `ruleSearch` 结构相同（一致则省略）。
