# Web 采集轨（Phase 1–4）

> 由主 skill Phase 0 路由到本文件。完成后须满足主文「合流契约」再进入 Phase 5。  
> 工具：curl、playwright。反爬字段配置见 [[anti-bot.md]]。骨架见 [[site-templates.md]]。排障见 [[debugging.md]]。

## 快速路径

- 只有站点 URL 或“帮我找规则”：从 Phase 1 开始。
- 用户已提供完整 HTML/JSON 和接口契约：从 Phase 3 开始。
- 无法访问站点但用户提供了完整响应样本：基于样本做 Phase 3–4（跳过真实请求处须在 `notes.md` 标明未实测）。

## 中间产物

`tmp/<source-id>/`（`source-id` 由书源名或域名生成并清理为安全短名）。简单任务可少存文件；交付前删除敏感响应。

响应文件扩展名按实际类型：HTML 用 `.html`，JSON 用 `.json`（下表示例名中的 `.html` 可替换）。

---

### Phase 1: 侦察

**目标：** 搞清站点技术架构和反爬级别。

1. curl 请求首页，检测响应：
   - 正常 HTML → 保存 `tmp/<source-id>/home.html`（或等价），记录 L0
   - 被拦 → 按下方阶梯逐级升级直到拿到可用页面/接口
2. 从响应识别：技术栈（纯 HTML / SPA / SSR+CSR）、域名关系、加密库引用
3. 识别入口：搜索表单/URL、分类导航、发现页；**优先记下 Network 中的真实 API**

#### 反爬升级阶梯

优先 curl + 请求头，无效才上 Playwright。拿到可用数据即停。

| Level  | 采集方式              | 触发特征                                               |
| ------ | --------------------- | ------------------------------------------------------ |
| **L0** | curl（仅 UA）         | 正常 HTML/JSON                                         |
| **L1** | curl + `Referer`      | L0 遇 CF/403/空响应                                    |
| **L2** | Playwright 后台无头   | L1 后仍见 `challenges.cloudflare.com`、`Just a moment` |
| **L3** | Playwright 可见浏览器 | L2 后仍见 Turnstile、滑块                              |

记录每个端点生效的 Level（不同端点可能不同）。书源配置映射在主文 Phase 5（查 [[anti-bot.md]]）。

**验证门：** 首页或主入口可获取 → 记录实际成功的 Level，进入 Phase 2。L3 仍失败 → 说明采集受阻，请求用户手动验证或提供响应样本。

---

### Phase 2: 数据采集

**目标：** 获取每个数据入口的响应，保存供分析。

默认用 Phase 1 的 Level 执行，单步被拦才对该步升级。存在分页时至少验证第 1、2 页；明确无分页时记录“无分页”，不强行制造第 2、3 页。

| 步骤     | 操作           | 保存（扩展名按实际）                                      |
| -------- | -------------- | --------------------------------------------------------- |
| 搜索     | 输入关键词搜索 | tmp/<source-id>/search.html 或 search.json                |
| 搜索翻页 | 第2、3页       | search_p2.* , search_p3.*                                 |
| 详情     | 打开一本书     | detail.*                                                  |
| 目录     | 进入目录       | catalog.*                                                 |
| 目录翻页 | 目录第2、3页   | catalog_p2.* , catalog_p3.*                               |
| 正文     | 打开一个章节   | content.*                                                 |
| 正文翻页 | 正文第2、3页   | content_p2.* , content_p3.*                               |

每步追加 `tmp/<source-id>/notes.md`：URL 模板、HTTP 方法、反爬级别、翻页参数、选择器/JSONPath 线索、加密/签名/重定向备注。

**验证门：** 每个样本含有效数据（非空/非报错/非挑战页）？是 → Phase 3。否 → 对该端点升级反爬级别重试。

---

### Phase 3: 静态分析

**目标：** 确定输入→取数方式→输出映射（选择器 / JsonPath / JS）。

从 Phase 2 样本与 `notes.md` 分析：

| 环节     | 输入       | 输出                | 分析来源                    |
| -------- | ---------- | ------------------- | --------------------------- |
| 搜索     | keyword    | bookUrl 列表        | search.*                    |
| 搜索翻页 | 第1页      | page 参数规律       | search → search_p2 → p3     |
| 详情     | bookUrl    | tocUrl + 元数据     | detail.*                    |
| 目录     | tocUrl     | chapterUrl 列表     | catalog.*                   |
| 目录翻页 | 第1页      | nextTocUrl 规律     | catalog 翻页样本            |
| 正文     | chapterUrl | content 文本        | content.*                   |
| 正文翻页 | 第1页      | nextContentUrl 规律 | content 翻页样本            |
| 发现     | 分类URL    | bookUrl 列表        | home 或分类样本             |

验证选择器/路径唯一性；分析 URL 加密；确认翻页规律一致。

**验证门：** 数据流可追溯 → Phase 4。有缺口 → 回对应样本补充分析。

---

### Phase 4: 数据验证

**目标：** 用脚本验证分析结果，再进入主文写源。

在 `tmp/<source-id>/verify.js` 中逐环节请求验证。默认仅 Node 内置 `fetch`、`URL` 与断言；JSON/API 不得强制第三方包。仅离线 CSS 选择器时可选 `npm install --no-save cheerio` 并在脚本头标注。请求默认间隔 2s。Playwright 不作为 verify.js 依赖。

| 环节     | 验证点                                  |
| -------- | --------------------------------------- |
| 搜索     | URL 正确、选择器/路径匹配、结果非空     |
| 搜索翻页 | page 生效、翻页后结果不同               |
| 详情     | 可访问、元数据/tocUrl 可提取            |
| 目录     | 可访问、章节列表非空                    |
| 目录翻页 | nextTocUrl 规律一致、章节不同           |
| 正文     | 可访问、正文非空无乱码                  |
| 正文翻页 | nextContentUrl 规律一致、内容不同       |
| 替换净化 | 语法正确，无误伤                        |
| 加解密   | 输出与浏览器一致（如有）                |

```bash
node tmp/<source-id>/verify.js
```

全部 PASS → 检查合流契约 → 回主文 Phase 5。FAIL → 回 Phase 3。

## 出口：合流契约

进入主文 Phase 5 前确认 `tmp/<source-id>/`：

1. `notes.md` 含各环节输入→请求→输出
2. 搜索/详情/目录/正文样本（扩展名正确）
3. `verify.js` 全 PASS（或样本-only 时在 notes 标明未实测）
4. 源格式意向：纯 JS（默认）或声明式 JSON

缺项则留在本轨补齐，不要直接写源。
