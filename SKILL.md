---
name: legado-source-skill
description: >
  为开源阅读 LegadoT 编写和调试书源、定时任务与 HTTP 在线朗读引擎。书源格式分为声明式 JSON源、JS 单文件源。支持网页写源与 App 逆向写源；定时任务支持 Cron 与动作协议；
  HTTP 在线朗读引擎支持请求规则和音色候选。触发词：写书源、调试书源、JS书源、
  漫画源、听书源、逆向app、apk、定时任务、自动任务、在线朗读、朗读引擎、HTTP TTS。
user-invokable: true
argument-hint: "[站点URL / APK / 定时任务 / TTS接口 / 描述]"
---

# LegadoT 规则编写

> 本技能用于开源阅读分支-阅读T。先按产物类型分流；书源、定时任务和 HTTP 在线朗读引擎是三种独立产物。书源分支中，JS 单文件源是推荐格式。

## 核心原则

1. **实事求是** — 依据真实响应、抓包或逆向结果写源；禁止无依据猜测签名/盐。解决不了就反馈用户，不擅自改目标。
2. **API 优先** — Web：优先 Network 真实接口。App：优先可复现的 HTTP 协议。页面选择器/UI 仅作兜底，并验证鉴权与反爬。
3. **可验证** — 选择器、JsonPath、签名步骤均须用完整样本或脚本验证后再写进源。

## 书源格式

新建源：默认JS单文件源；仅当用户明确要求原版兼容或提供 JSON 模板时用声明式 JSON。  
调试已有源：沿用原格式，不擅自转换。多步签名/复杂翻页/动态 API 时说明纯 JS 优势并默认纯 JS。  
纯 JS 非原版通用格式，交付时提醒在阅读T中导入。

|          | 纯JS单文件源（推荐，仅本 fork）                           | 声明式 JSON 源                              |
| -------- | --------------------------------------------------------- | ------------------------------------------- |
| 形态     | 一个 `.js` 文件，`search`/`getChapters`/`getContent` 函数 | 规则字段 DSL（CSS/XPath/JsonPath + 内嵌JS） |
| 适合     | 默认；强加密/多步拼装/复杂翻页/App 协议                   | 需与原版 legado 生态互通                    |
| 解析手段 | `org.jsoup.Jsoup.parse` / `JSON.parse` / 正则             | 规则选择器 + `java.getString` 等            |
| 发现页   | 支持（`exploreUrl` + `explore` 成对）                     | 支持                                        |
| 契约参考 | [[references/js-source-format.md]]                        | [[references/fields.md]]                    |

采集轨（Phase 1–4）与源格式无关；Phase 5/6 按格式分叉。

## 工作流总览

阶段制 + 验证门。中间产物：`tmp/<source-id>/`（书源名或域名清理为短名）。简单任务可少文件；交付前删敏感数据。

### Phase 0: 路径分流（必做）

| 条件                                      | 打开                            | 起点                                         |
| ----------------------------------------- | ------------------------------- | -------------------------------------------- |
| 定时任务 / Cron / 自动更新目录 / 定时通知 | [[references/auto-task.md]]     | 定时任务工作流；产出 `AutoTaskRule` JSON     |
| 在线朗读 / HTTP TTS / 朗读接口 / 音色候选 | [[references/http-tts.md]]      | HTTP 在线朗读引擎工作流；产出 `HttpTTS` JSON |
| 站点 URL / 网页规则 / CF 等               | [[references/workflow-web.md]]  | Web Phase 1；有完整 HTML/JSON 契约可从 3     |
| APK / 包名 / mt-apk·ida / App 接口        | [[references/workflow-app.md]]  | App Phase 1A                                 |
| 修已有源、仅报错                          | 不强制开 workflow               | 定位规则/函数 → Phase 6/7；缺数据再回对应轨  |
| Web + 端内加密混合                        | 先 web 拿接口，签名卡住再开 app | 同一 `notes.md`；**须声明主轨**              |

**硬规则：** 先确认产物类型。定时任务不写成书源，HTTP 在线朗读引擎不写成听书源。书源 Phase 1–4 同时只以一条轨为主；禁止无依据猜签名/盐。

### 快速路径

- 仅站点 URL → workflow-web Phase 1
- 仅 APK / 逆向 App → workflow-app Phase 1A
- 已有完整响应+契约 → 对应轨 Phase 3/4 后合流
- 用户指定纯 JS 或 JSON → 遵守，不重做格式选择
- 样本可写但未真实请求 → 可实现，须在交付说明未联调

### 合流契约（进入 Phase 5 前）

`tmp/<source-id>/` 须有：

1. **`notes.md`** — 各环节输入→请求→输出；URL/方法/头/鉴权/翻页/签名（算法+样例）
2. **响应样本** — search / detail / catalog / content（扩展名按 `.html`/`.json` 等实际类型）
3. **验证证据** — `verify.js`（或等价）PASS，或 notes 标明样本-only
4. **格式意向** — 纯 JS（默认）或声明式 JSON

缺项 → 回对应 workflow，不写源。

---

### Phase 5: 写源

**目标：** 只消费合流契约中的数据流与验证结果写源。

**反爬（Web 轨）：** 按采集轨记录的 Level 查 [[references/anti-bot.md]]（L0=UA、L1=Referer/CookieJar、L2=webView、L3=人工/`startBrowserAwait`）。禁止把未验证 Level 当事实。

**App 轨：** 将 verify 中的签名与请求逻辑迁入纯 JS（`java.ajax` / `java.md5Encode` 等），见 [[references/js-source-format.md]] 与 [[references/js-api.md]]。

**纯JS（推荐）：** [[references/js-source-format.md]] — `config` → `search` → `getChapters` → `getContent`（`getBookInfo` 按需）。`fetch`→`java.ajax`、`cheerio`→`org.jsoup`，勿照搬 Node 异步模型。

**声明式 JSON：** [[references/fields.md]] + [[references/rule-syntax.md]] + [[references/js-api.md]]：基础字段 → 搜索 → 详情 → 目录 → 正文 → 发现（可选）。

---

### Phase 6: 语法验证

脚本（他处调用写 skill 绝对路径）：

```bash
node <skill目录>/scripts/validate-booksource.js path/to/booksource.json
node <skill目录>/scripts/validate-jssource.js path/to/source.js
node <skill目录>/scripts/validate-autotask.js path/to/task.json
node <skill目录>/scripts/validate-http-tts.js path/to/http-tts.json
```

JSON：必填字段、`@js:`/`<js>` 用 `vm.Script` 编译、字段名合法。  
JS：整文件语法、Rhino 面、`java.*`、config、必备函数契约。

通过 → MCP 可用则 Phase 7；否则交付并由用户导入，清理 `tmp/<source-id>/`。

交付前：绝对 `bookUrl`；章节 `title`/`url`；正文非空无挑战页；分页可停止；图床 Referer；`bookSourceType`/`type` 契约正确。

---

### Phase 7: App 内闭环实测（legado MCP 可用时）

短名：`save_source`、`debug_source`、`list_sources`、`get_source`、`delete_sources`、`get_http_logs`、`get_http_log`、`set_http_log_recording`。

**流程：** `save_source` → `debug_source` → 必要时 `set_http_log_recording(true)` 再跑 → `get_http_logs`/`get_http_log` 看实发头 → 改源重推 → 收尾关日志。

`debug_source` key：关键词=全管线；绝对 URL=详情；`::URL`=发现；`++URL`=目录；`--URL`=正文。

`get_http_log` 体截断 4096；PC 侧 tmp 样本不能当作 App 完整响应替代。

**验证门：** 搜索/详情/目录/正文（+发现）日志通过 → `list_sources` 确认 → 交付并清理 tmp（成品测试源勿删；删源用 `delete_sources`）。

## 实现选择（按场景跳转）

| 场景                          | 怎么做                | 详细看                                       |
| ----------------------------- | --------------------- | -------------------------------------------- |
| 定时执行 JS / 更新目录 / 通知 | 产出定时任务 JSON     | [[references/auto-task.md]]                  |
| HTTP 接口合成语音 / 配置音色  | 产出在线朗读引擎 JSON | [[references/http-tts.md]]                   |
| 网页站采集 Phase 1–4          | 打开 Web 轨           | [[references/workflow-web.md]]               |
| App/APK 采集 Phase 1A–4A      | 打开 App 轨           | [[references/workflow-app.md]]               |
| 查字段名、规则对象、翻页字段  | —                     | [[references/fields.md]]                     |
| HTML 解析                     | JSoup                 | [[references/rule-syntax.md]] §JSoup         |
| JSON 解析                     | JsonPath              | [[references/rule-syntax.md]] §JsonPath      |
| 规则内 JS                     | `@js:`                | [[references/rule-syntax.md]] §JavaScript    |
| 搜索 POST 后 302              | searchUrl JS          | [[references/js-api.md]] §重定向搜索         |
| 列表跨兄弟节点                | JS bookList + `$.xxx` | [[references/rule-syntax.md]] §bookList      |
| API id 拼 URL                 | 拼好 bookUrl          | [[references/rule-syntax.md]] §JsonPath      |
| 阅读 JS API                   | —                     | [[references/js-api.md]]                     |
| 登录 UI / 登录态 / 多步认证   | —                     | [[references/login.md]]                      |
| CF/挑战/403/认证态联动        | —                     | [[references/anti-bot.md]]                   |
| 搜索空/字段空/死循环/乱码     | —                     | [[references/debugging.md]]                  |
| 站点骨架                      | —                     | [[references/site-templates.md]]             |
| 纯 JS 契约/迁移               | —                     | [[references/js-source-format.md]]           |
| Java 字符串 replace 歧义      | `String(...)`         | [[references/js-source-format.md]] §运行环境 |
| App 内实测                    | legado MCP            | 本文 Phase 7                                 |
