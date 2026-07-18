---
name: legado-source-skill
description: >
  为开源阅读 Legado 编写和调试书源（声明式 JSON 源 / 纯JS单文件源）。触发词：写书源、
  创建书源、调试书源、书源规则、JS书源、legado source。用户提到网站爬取、章节获取、
  HTML/JSON转书源时也使用。
user-invokable: true
argument-hint: "[站点URL或描述]"
---

# Legado 书源编写

> 本技能用于开源阅读分支-阅读T。纯 JS 单文件源是阅读T的推荐格式；除非用户明确要求兼容原版 Legado，否则不要把新源写成声明式 JSON。

## 角色分工

AI：使用curl、Playwright MCP（DOM、Network XHR）、Nodejs、读文件等方法分析网站并制作书源。装有 legado MCP（工具名 `mcp__legado__*`）时，还能直连运行中的阅读T推送书源、跑 App 内调试、读 HTTP 请求日志，自行完成实测闭环（Phase 7）。

用户：legado MCP 不可用时导入书源到 App 实测，反馈现象（截图、报错、章节缺失）；使用 MCP 前开启手机「MCP 服务」（设置页，与 Web 服务独立，注册命令见主仓 api.md 的 MCP 小节）。

## 核心原则

1. 实事求是 — 靠推理写源，不猜测
2. API 优先 — Playwright Network 看 XHR；JSON API 反爬弱
3. 选择器唯一 — 抓完整HTML确保选择器唯一

## 任务分流与源格式

新建源：默认纯 JS 单文件源；只有用户明确要求原版 Legado 兼容或提供了 JSON 源模板时，才使用声明式 JSON。
调试已有源：沿用原文件格式，不要为了“更简单”擅自转换格式。用户未明确目标且站点需要多步签名、复杂翻页或动态 API 时，说明阅读T纯 JS 源的优势并直接按纯 JS 流程处理。

纯 JS 源不是原版 Legado 的通用格式，交付时要明确提醒用户在阅读T中导入或粘贴。

|          | 纯JS单文件源（推荐，仅本 fork）                           | 声明式 JSON 源                              |
| -------- | --------------------------------------------------------- | ------------------------------------------- |
| 形态     | 一个 `.js` 文件，`search`/`getChapters`/`getContent` 函数 | 规则字段 DSL（CSS/XPath/JsonPath + 内嵌JS） |
| 适合     | 默认选择；强加密/多步拼装/复杂翻页尤其适合                | 需与原版 legado 生态互通                    |
| 解析手段 | `org.jsoup.Jsoup.parse` / `JSON.parse` / 正则             | 规则选择器 + `java.getString` 等            |
| 发现页   | 支持（`exploreUrl` 分类 + `explore` 函数成对）            | 支持                                        |
| 契约参考 | [[references/js-source-format.md]]                        | [[references/fields.md]]                    |

Phase 1-4（侦察/采集/分析/验证）与格式无关，照常执行；Phase 5/6 按格式分叉。

## 工作流

按逆向工程标准流程分阶段执行，每阶段有验证门，不通过不进入下一阶段。各阶段保存文件到当前工作目录的 `tmp/` 子目录（不存在则创建）。

### Phase 1: 侦察

**目标：** 搞清站点技术架构和反爬级别。

1. curl 请求首页，检测响应：
   - 正常 HTML → 保存 `tmp/home.html`，记录 L0
   - 被拦 → 按下方阶梯逐级升级直到拿到 HTML
2. 从 HTML 识别：技术栈（纯 HTML / SPA / SSR+CSR）、域名关系、加密库引用
3. 识别入口：搜索表单/URL、分类导航、发现页

#### 反爬升级阶梯

优先 curl + 请求头，无效才上 Playwright。拿到正常 HTML 即停。

| Level  | 采集方式              | 触发特征                                               |
| ------ | --------------------- | ------------------------------------------------------ |
| **L0** | curl（仅 UA）         | 正常 HTML                                              |
| **L1** | curl + `Referer`      | L0 遇 CF/403/空响应                                    |
| **L2** | Playwright 后台无头   | L1 后仍见 `challenges.cloudflare.com`、`Just a moment` |
| **L3** | Playwright 可见浏览器 | L2 后仍见 Turnstile、滑块                              |

记录每个端点生效的 Level（不同端点可能不同，如搜索 L1 + 正文 L0）。书源配置映射见 Phase 5。

**验证门：** 首页 HTML 可获取 → 记录 Level，进入 Phase 2。L3 仍失败 → 站点不可用，终止。

---

### Phase 2: 数据采集

**目标：** 获取每个数据入口的 HTML/JSON 响应，保存供分析。

默认用 Phase 1 的 Level（curl）执行，单步被拦才对该步升级。存在分页时至少验证第 1、2 页；明确无分页时记录“无分页”，不强行制造第 2、3 页。

| 步骤     | 操作           | 保存                                     |
| -------- | -------------- | ---------------------------------------- |
| 搜索     | 输入关键词搜索 | tmp/search.html                          |
| 搜索翻页 | 第2、3页       | tmp/search_p2.html, tmp/search_p3.html   |
| 详情     | 点击一本书     | tmp/detail.html                          |
| 目录     | 进入目录页     | tmp/catalog.html                         |
| 目录翻页 | 目录第2、3页   | tmp/catalog_p2.html, tmp/catalog_p3.html |
| 正文     | 打开一个章节   | tmp/content.html                         |
| 正文翻页 | 正文第2、3页   | tmp/content_p2.html, tmp/content_p3.html |

每步保存后追加 `tmp/notes.md`：URL 模板、HTTP 方法、反爬级别、翻页参数规律、选择器线索、加密/签名/重定向备注。

**验证门：** 每个 HTML 含有效数据（非空/非报错/非挑战页）？是 → Phase 3。否 → 对该端点升级反爬级别重试。

---

### Phase 3: 静态分析

**目标：** 逆向数据流，确定输入→输出映射和选择器。

从 Phase 2 的 HTML 和 `tmp/notes.md` 分析，每个环节回答：输入是什么 → 怎么取（选择器/JS）→ 输出是什么。

| 环节     | 输入       | 输出                | 分析来源                                         |
| -------- | ---------- | ------------------- | ------------------------------------------------ |
| 搜索     | keyword    | bookUrl 列表        | tmp/search.html                                  |
| 搜索翻页 | 第1页      | page 参数规律       | search.html → search_p2.html → search_p3.html    |
| 详情     | bookUrl    | tocUrl + 元数据     | tmp/detail.html                                  |
| 目录     | tocUrl     | chapterUrl 列表     | tmp/catalog.html                                 |
| 目录翻页 | 第1页      | nextTocUrl 规律     | catalog.html → catalog_p2.html → catalog_p3.html |
| 正文     | chapterUrl | content 文本        | tmp/content.html                                 |
| 正文翻页 | 第1页      | nextContentUrl 规律 | content.html → content_p2.html → content_p3.html |
| 发现     | 分类URL    | bookUrl 列表        | tmp/home.html                                    |

验证选择器唯一性，分析 URL 加密/解密逻辑，确认翻页参数规律一致。

**验证门：** 数据流可追溯 → Phase 4。有缺口 → 回对应 HTML 补充分析。

---

### Phase 4: 数据验证

**目标：** 用 Node.js 脚本验证分析结果，确保选择器和加密逻辑正确，再写书源。

编写 `tmp/verify.js`，逐环节发请求验证。默认只使用 Node 内置 `fetch`、`URL` 和断言；JSON/API 验证不得要求第三方包。只有需要离线执行 CSS 选择器时，才可选安装 `cheerio`，并在脚本开头明确标注该依赖。每步间隔 2s 避免风控。Phase 3 的分析结果填入配置对象。

可选依赖：`npm install --no-save cheerio`。Playwright 侦察使用现有浏览器工具，不作为 `verify.js` 的 Node 依赖。

| 环节     | 验证点                                  |
| -------- | --------------------------------------- |
| 搜索     | URL 正确、选择器匹配、结果非空          |
| 搜索翻页 | page 参数生效、翻页后结果不同           |
| 详情     | 可访问、元数据/tocUrl 可提取            |
| 目录     | 可访问、章节列表非空                    |
| 目录翻页 | nextTocUrl 规律一致、翻页后章节不同     |
| 正文     | 可访问、正文非空无乱码                  |
| 正文翻页 | nextContentUrl 规律一致、翻页后内容不同 |
| 替换净化 | 语法正确，替换无误伤                    |
| 加解密   | 函数输出与浏览器一致（如有）            |

```bash
node tmp/verify.js
```

全部 PASS → Phase 5。有 FAIL → 回 Phase 3 修正。

---

### Phase 5: 开始写源

**目标：** 按 Phase 3 的数据流图和 Phase 4 的验证结果写源。

**反爬：** 按 Phase 1/2 记录的 Level 查 [[references/anti-bot.md]] 配置对应字段（L0=仅 UA、L1=+Referer+CookieJar、L2=+webView、L3=+startBrowserAwait）。

**纯JS单文件源（推荐）**：按 [[references/js-source-format.md]] 写 `.js`（source 配置 → search → getBookInfo → getChapters → getContent）。Phase 4 `tmp/verify.js` 验证过的解析逻辑逐行迁移进函数体（`fetch`→`java.ajax`、`cheerio`→`org.jsoup`，映射表见该参考文末）。

**声明式 JSON 源**：从 [[references/fields.md]] 预填充字段，写源过程中查看 [[references/rule-syntax.md]] 和 [[references/js-api.md]]。按数据流顺序实现：

1. 基础字段（bookSourceUrl, header, enabledCookieJar 等）
2. 搜索（searchUrl + ruleSearch，含翻页）
3. 详情（ruleBookInfo）
4. 目录（ruleToc，含翻页）
5. 正文（ruleContent，含翻页）
6. 发现（exploreUrl + ruleExplore）

---

### Phase 6: 语法验证

**目标：** 检查源的结构、JS 语法和字段名合法性。脚本在本 skill 的 `scripts/` 目录
（[[scripts/validate-booksource.js]] / [[scripts/validate-jssource.js]]），从其他工作目录调用时写完整路径。

```bash
# 声明式 JSON 源
node <skill目录>/scripts/validate-booksource.js path/to/booksource.json
# 纯JS单文件源
node <skill目录>/scripts/validate-jssource.js path/to/source.js
```

JSON 源检查：必填字段是否缺失、`@js:` / `<js>` 块用 `vm.Script` 原样编译（与 Legado 一致）是否有语法错误、字段名是否在 [[references/fields.md]] 合法范围内。
JS 源检查：整文件语法、Rhino 不兼容语法、`java.*` 是否在 JsExtensions 面内、source 必填键与类型、三个必备函数存在。

全部通过 → legado MCP 可用时进入 Phase 7 闭环实测；否则交付书源（JSON 或 `.js` 文件）由用户导入验证，清理 `tmp/`。有报错 → 修正后重跑。

交付前检查：搜索和发现条目含绝对 `bookUrl`；章节含有效 `title`/`url`；正文非空且无挑战页/乱码；分页末页返回空并停止；图片源确认 Referer；纯 JS 的 `bookSourceType` 与结果对象 `type` 使用各自契约。

---

### Phase 7: App 内闭环实测（legado MCP 可用时）

**目标：** 在真实 App 环境跑通全管线，交付已验证的源。

`save_source` 推送（返回 bookSourceUrl）→ `debug_source` 调试 → 失败时 `get_http_logs` / `get_http_log` 看 App 实发请求 → 改源重推 → 复测。

`debug_source` 的 key 决定入口：普通关键词=搜索→详情→目录→正文全管线；绝对URL=详情起步；`::URL`=发现页；`++URL`=仅目录；`--URL`=仅正文。改动只涉及单步时用前缀分步复测，省整链耗时。

`get_http_log` 的价值是 App 实发请求头（CookieStore/UA/重定向）与 Phase 2 采集时的差异对比；正文在 App 记录时截断至 4096 字符，完整响应体以 `tmp/` 存档为准。HTTP 日志需开启「记录HTTP日志」：`set_http_log_recording(true)` 远程开启，验收收尾时关闭。

**验证门：** 搜索/详情/目录/正文（+发现，如有）日志全绿 → 交付源文件，清理 `tmp/`。测试源已在 App 内即成品。

## 实现选择（按场景跳转）

| 场景                                                                     | 怎么做                                                | 详细看                                                   |
| ------------------------------------------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------- |
| 查字段名、规则对象结构、翻页字段                                         | —                                                     | [[references/fields.md]]                                 |
| HTML解析                                                                 | JSoup（默认模式）                                     | [[references/rule-syntax.md]] §JSoup/CSS 选择器          |
| JSON 解析                                                                | `$.path[*]` JsonPath                                  | [[references/rule-syntax.md]] §JsonPath                  |
| JS 处理                                                                  | 选择器（可选）后追加 `@js:`                           | [[references/rule-syntax.md]] §规则中的 JavaScript       |
| 搜索需 POST 后 302                                                       | `searchUrl` 使用JS处理                                | [[references/js-api.md]] §重定向搜索                     |
| 列表项数据跨兄弟元素（如 `<dt>/<dd>`）                                   | JS bookList 拼 NativeObject 数组，字段用 `$.xxx` 直读 | [[references/rule-syntax.md]] §bookList/chapterList 约束 |
| API 返回 ID 拼 URL                                                       | bookList 用 JS 拼好完整 `bookUrl`，字段用 `$.bookUrl` | [[references/rule-syntax.md]] §JsonPath                  |
| 阅读专属JS变量与函数                                                     | —                                                     | [[references/js-api.md]]                                 |
| 拿到 CF 验证页、JS 挑战页、403、需手动登录                               | —                                                     | [[references/anti-bot.md]]                               |
| 用户反馈：搜索空 / 字段空 / 死循环 / 乱码 / 图片不显示                   | —                                                     | [[references/debugging.md]]                              |
| 找具体站点类型起手骨架（HTML网页、JSON API、登录、漫画）                 | —                                                     | [[references/site-templates.md]]                         |
| 纯JS单文件源：config 键、四函数契约、运行环境、迁移映射                  | —                                                     | [[references/js-source-format.md]]                       |
| JS 源字符串操作报错/判空失灵（正则 `replace`、`split`、`length`、`===`） | Java 来源值先 `String(...)` 归一化                    | [[references/js-source-format.md]] §运行环境             |
| App 内实测：推送书源、跑调试管线、看 App 实发请求                        | legado MCP：save_source / debug_source / get_http_log | 本文 Phase 7                                             |
