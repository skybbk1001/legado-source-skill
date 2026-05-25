---
name: legado-book-source
description: >
  为 Legado（阅读）编写和调试书源 JSON。触发词：写书源、创建书源、调试书源、
  书源规则、legado source。用户提到网站爬取、章节获取、HTML/JSON转书源时也使用。
user-invokable: true
argument-hint: "[站点URL或描述]"
---

# Legado 书源编写

## 角色分工

AI：使用curl、Playwright MCP（DOM、Network XHR）、WebFetch、读文件等方法分析网站并制作书源。

用户：导入 JSON 到 App 实测，反馈现象（截图、报错、章节缺失）。

## 核心原则

1. 实事求是 — 靠推理写源，不猜测
2. API 优先 — Playwright Network 看 XHR；JSON API 反爬弱
3. 选择器唯一 — 抓完整HTML确保选择器唯一

## 工作流

### 1. 反爬识别（前置）

工作流每一步都进行反爬检测
```bash
# 检查清单
[ ] HTTP 状态是否正常（200）
[ ] 响应是否为 HTML/JSON（非 JS 挑战页）
[ ] 是否需要特定请求头（Referer/Origin）
[ ] 是否需要 Cookie/session
[ ] 是否有频率限制（多次请求测试）
[ ] Cloudflare/其他 WAF 是否存在
```

命中反爬 → 按 [[references/anti-bot.md]] 配置：
- Cookie: `enabledCookieJar: true` + 浏览器 UA `header`
- CF: `loginCheckJs` 模板

### 2. 加载首页HTML
使用curl请求网站首页HTML，保存到tmp/home.html文件供后续使用

### 3. 分析搜索请求
从tmp/home.html中分析搜索请求的路径、方法、参数，使用curl进行验证，搜索结果的HTML里出现关键词相关的书籍列表视为成功，成功后保存curl命令到tmp/search.cu，保存HTML到tmp/search.html。如果搜索请求地址为动态生成，成功后保存请求构建流程到tmp/search.md

### 4. 分析详情请求
从tmp/search.html中提取书籍详情地址，使用curl进行验证，详情结果的HTML里出现该书详情信息视为成功，成功后保存curl命令到tmp/detail.cu，保存HTML到tmp/detail.html

### 5. 分析目录请求
从tmp/detail.html中提取书籍目录地址，使用curl进行验证，目录结果的HTML里出现该书目录信息视为成功，成功后保存curl命令到tmp/catalog.cu，保存HTML到tmp/catalog.html。之后继续分析目录分页请求，成功后保存curl命令到tmp/catalog2.cu

### 6. 分析正文请求
从tmp/catalog.html中提取章节地址，使用curl进行验证，出现完整正文视为成功，成功后保存curl命令到tmp/content.cu，保存HTML到tmp/content.html。之后继续分析正文分页请求，成功后保存curl命令到tmp/content2.cu

### 7. 分析分类请求
从tmp/home.html中分析网站书籍分类，使用curl进行验证，出现相关书籍列表视为成功，成功后保存curl命令到tmp/Discover.cu，保存HTML到tmp/Discover.html

### 7. 开始写源
创建xxxx_bookSource.json，从字段文档[[references/fields.md]]中预填充所有字段。写源过程中可随时查看规则文档[[references/rule-syntax.md]]和js文档[[references/js-api.md]]

#### 7.1 基础字段
其中header全局请求头字段中，可省略User-Agent，有应用级别的全局UA做兜底，只在需要特定UA时才主动添加。
```json
{
  "bookSourceUrl": "https://site.com",
  "bookSourceName": "站点名",
  "bookSourceType": 0,
  "header": "{\"User-Agent\": \"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36\"}",
  "enabledCookieJar": true,  // Cookie 站点必需
  "concurrentRate": "1000"
}
```

#### 7.2 搜索规则
`searchUrl` + `ruleSearch`
从tmp/search.cu和tmp/search.md中获取刚刚分析的搜索请求方法；从tmp/search.html中获取书籍列表结构字段，从tmp/detail.cu中获取构建书籍详情URL的方法

#### 7.3 详情规则（可选）
`ruleBookInfo`
从tmp/detail.html中获取书籍详情字段，从tmp/catalog.cu中获取构建书籍目录URL的方法

#### 7.4 目录规则
`ruleToc`
从tmp/catalog.html中获取目录列表结构字段，从tmp/content.cu中获取正文URL构建方法，从tmp/catalog2.cu中获取目录下一页URL的构建方法

#### 7.5 正文规则
`ruleContent`
从tmp/content.cu中获取正文字段

#### 7.6 发现规则
从tmp/home.html中获取分类字段和url，从tmp/Discover.cu获取url构建方法，从tmp/Discover.html获取书籍列表字段

#### 7.6 交付验证
运行 `python scripts/validate-booksource.py`检查书源并修复所有报错和警告，无问题后交付书源


## 实现选择（按场景跳转）

| 场景 | 怎么做 | 详细看 |
|---|---|---|
| 查字段名、规则对象结构、翻页字段 | — | [[references/fields.md]] |
| HTML解析 | JSoup（默认模式） | [[references/rule-syntax.md]] §JSoup/CSS 选择器 |
| JSON 解析 | `$.path[*]` JsonPath | [[references/rule-syntax.md]] §JsonPath |
| JS 处理 | 选择器（可选）后追加 `@js:` | [[references/rule-syntax.md]] §规则中的 JavaScript |
| 搜索需 POST 后 302 | `searchUrl` 使用JS处理 | [[references/js-api.md]] §重定向搜索 |
| 列表项数据跨兄弟元素（如 `<dt>/<dd>`） | JS bookList 拼 NativeObject 数组，字段用 `$.xxx` 直读 | [[references/rule-syntax.md]] §bookList/chapterList 约束 |
| API 返回 ID 拼 URL | bookList 用 JS 拼好完整 `bookUrl`，字段用 `$.bookUrl` | [[references/rule-syntax.md]] §JsonPath |
| 阅读专属JS变量与函数 | — | [[references/js-api.md]] |
| 拿到 CF 验证页、403、需手动登录 | — | [[references/anti-bot.md]] |
| 用户反馈：搜索空 / 字段空 / 死循环 / 乱码 / 图片不显示 | — | [[references/debugging.md]] |
| 找具体站点类型起手骨架（HTML网页、JSON API、登录、漫画） | — | [[references/site-templates.md]] |
