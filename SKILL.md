---
name: legado-book-source
description: >
  为 Legado（阅读）编写和调试书源 JSON。涵盖 JSoup、JsonPath、JS 规则、
  搜索、详情、目录、正文、登录、反爬。触发："写书源"、"创建书源"、"调试书源"、
  "书源规则"、"legado source"、"XX站点书源"、"分析书源"、"修复书源"。
user-invokable: true
argument-hint: "[站点URL或描述]"
---

# Legado 书源编写专家

## 角色分工

你（AI）能做：用 **Playwright MCP**（打开页面、抓 DOM、跑站点自身 JS、截图、看 Network XHR）、**curl/Bash**（拿原始响应 + headers + cookies）、**WebFetch**（快速取页面）、读文件，验证选择器对实际 HTML 成立、生成最终 JSON。

**用户**负责：把你生成的 JSON 导入 Legado App，跑搜索/详情/目录/正文实测，把现象反馈给你（截图、报错文字、章节缺失等）。

工作循环：你写规则 → 用户导入测试 → 用户反馈现象 → 你定位修改。

## 核心原则

1. **极简优先** — 先骨架后增量。每加一个字段都先用 Playwright/curl 对着实际 HTML 验证再加下一个。
2. **API 优先** — Playwright Network 优先看 XHR；JSON API 比 HTML 反爬弱、字段干净。
3. **不靠猜测** — 抓完整 HTML 片段（如整个列表项）看清所有子元素，DOM 实际什么样就写什么样。
4. **每步最多 3 次尝试** — 第 3 次失败则换方案（换选择器、转 JS、换页面入口）。

## 工作流（6 步）

每完成一步**让用户在 App 里实测**再进入下一步。增量验证。

1. **侦察** — Playwright MCP 打开网站首页、搜索结果页、详情页、目录页、正文页五类页面，抓 DOM 和 Network XHR。重点确认列表项容器、字段相对位置、URL 模板。
2. **骨架** — 写最小 BookSource 头部字段（字段清单见 [[references/fields.md]]）。
3. **搜索** — 写 `searchUrl` + `ruleSearch`（至少 `bookList`、`name`、`author`、`bookUrl`）。Playwright 跑实际搜索 URL，对着拿到的 HTML 验证 `bookList` 元素数 = 页面可见结果数。
4. **详情** — 写 `ruleBookInfo`（至少 `name`、`coverUrl`、`intro`、`tocUrl`）。Playwright 打开任一搜索结果的详情页，对着 HTML 验证字段。
5. **目录 + 正文** — `ruleToc` 和 `ruleContent`。**翻页必验**：用 Playwright 打开非末页和末页两种章节，确认 `nextTocUrl`/`nextContentUrl` 在非末页返回 URL、末页返回空（末页有 URL → App 死循环）。
6. **可选增强** — 发现规则、反爬、字体反爬、登录、缓存。

交付：把 JSON 给用户，**附一条"请在 App 里测：搜索 X / 打开任一书 / 读最新章节"**，等用户反馈实测现象再迭代。

## 触发反爬的信号

任一命中即按 [[references/anti-bot.md]] 配置：

- curl/WebFetch HTTP 状态码 ≥ 400
- 响应体含 `challenges.cloudflare.com`、`_cf_chl_opt`、`Just a moment`
- curl/WebFetch 拿到验证页，但 Playwright 打开正常（说明站点要 JS 渲染或浏览器指纹）
- 站点要 cookie/session（登录后才能搜）

最小反爬配置：`enabledCookieJar: true` + 浏览器 UA 的 `header`。CF 验证页另加 `loginCheckJs`（模板在 [[references/anti-bot.md]]）。

## 实现选择（按场景跳转）

| 场景 | 怎么做 | 详细看 |
|---|---|---|
| 查字段名、规则对象结构、翻页字段 | — | [[references/fields.md]] |
| 简单 CSS 选择即可 | JSoup（默认模式） | [[references/rule-syntax.md]] §JSoup |
| JSON API 响应 | `$.path[*]` JsonPath | [[references/rule-syntax.md]] §JsonPath |
| 单行小逻辑（trim、replace） | 字段后追加 `@js:` | [[references/rule-syntax.md]] §JS |
| 多行复杂逻辑 | 字段写 `<js>...</js>` 块 | [[references/rule-syntax.md]] §JS |
| 搜索需 POST 后 302 | `searchUrl` 写整段 `<js>...</js>` | [[references/js-api.md]] §重定向搜索 |
| 列表项数据跨兄弟元素（如 `<dt>/<dd>`） | JS bookList 拼 NativeObject 数组，字段用 `$.xxx` 直读 | [[references/rule-syntax.md]] §bookList 进阶 |
| API 返回 ID 拼 URL | bookList 用 JS 拼好完整 `bookUrl`，字段用 `$.bookUrl` | [[references/rule-syntax.md]] §JsonPath |
| CSS 表达不了 | XPath（`//` 或 `@XPath:` 前缀） | [[references/rule-syntax.md]] §其他模式 |
| 写 `java.xxx`、加解密、WebView、字体反爬、上下文变量 | — | [[references/js-api.md]] |
| 拿到 CF 验证页、403、需手动登录 | — | [[references/anti-bot.md]] |
| 用户反馈：搜索空 / 字段空 / 死循环 / 乱码 / 图片不显示 | — | [[references/debugging.md]] |
| 找具体站点类型起手骨架（笔趣阁式、JSON API、登录、漫画） | — | [[references/site-templates.md]] |
