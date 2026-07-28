# App 采集轨（Phase 1A–4A）

> 由主 skill Phase 0 路由到本文件。完成后须满足主文「合流契约」再进入 Phase 5。  
> **工具：** mt-apk-mcp（APK 结构/smali/字符串/xref）、ida-pro-mcp（native `.so`）、so-mcp（native `.so`）。  
> capstone 仅在 IDA/so-mcp 不可用时作反汇编兜底，默认不走。

## 硬规则

- 无抓包样本、无 smali/native 依据时，**禁止猜测** 签名字段、盐、密钥。
- 优先还原 URL / 方法 / 头 / body / 签名，写入 `notes.md` 与 `verify.*`，再进主文写源。
- 中间产物：`tmp/<source-id>/`（与主文相同）。
- Java/Kotlin 层能还原则**不要**进 so；JNI 转发才上 ida。

## 快速路径

| 已有信息                           | 起点                                        |
| ---------------------------------- | ------------------------------------------- |
| APK 路径 / `mt://current-apk`      | Phase 1A                                    |
| 仅包名，无 APK                     | 向用户要 APK 或抓包；勿空转                 |
| 完整接口契约 + 签名说明 + 响应样本 | Phase 3A/4A 校验后合流                      |
| 仅 HAR/日志                        | 落盘 `tmp/<source-id>/` → Phase 2A 整理端点 |

---

### Phase 1A: 打开与概览

**目标：** 建立 workspace，扫出 API / 签名线索。

1. **打开 APK**
   - `mt_apk_list_available_apks`（可选）→ 选 path
   - `mt_apk_open(path, temporary=…)` → 记下 `workspaceId`、包名、组件摘要
   - 后续读写一律带同一 `workspaceId`；编辑会话用 `editSessionId=""`（只读分析）
2. **总览搜索**（`mt_apk_search`，`target=overview`，`query` 轮换）  
   关键词示例：`http`、`https`、`api`、`/v1/`、`sign`、`token`、`chapter`、`book`、`search`、`catalog`、`content`
3. **收窄**
   - 字符串命中 → `target=dex_string_members` / `smali` 定位类方法
   - 资源/配置 → `target=files` 或 `resource_table_*`（看 baseUrl、渠道配置）
4. **Native 预判**
   - ZIP 里有业务相关 `.so` 且 dex 只有 `native` 声明 / JNI 薄封装 → 记 so 名，Phase 3A 再 ida
   - 纯 Java 加密则跳过 so
5. 写入 `tmp/<source-id>/notes.md`：包名、`workspaceId`、候选 host、候选类/方法、so 列表（如有）

**验证门：** 有可跟的 API 字符串 / 类名 / 抓包，或用户补样本。否则停，向用户要 APK/抓包/文档。

---

### Phase 2A: 定位业务接口

**目标：** 对齐书源四段：搜索 / 详情 / 目录 / 正文（发现可选）。

每个环节在 `notes.md` 固定字段：

| 字段      | 内容                             |
| --------- | -------------------------------- |
| 环节      | search / detail / toc / content  |
| URL 模板  | path + query/body 占位           |
| 方法      | GET/POST/…                       |
| 头        | UA、Authorization、自定义头      |
| 签名/鉴权 | 字段名；算法未知标「待 3A」      |
| 样本路径  | `tmp/<source-id>/search.json` 等 |

**手段优先级（由易到难）：**

1. 用户抓包 / HAR / 日志（最快，优先对齐真机）
2. mt-apk 静态：
   - `mt_apk_search`（`dex_strings` / `smali`）找 URL 与参数组装
   - 命中方法 → `mt_apk_read_text` 读 smali
   - `mt_apk_xref_dex`（`methodResolution=dispatch`）找调用方
   - `mt_apk_outline_class` 看同类字段与其它 API
3. 明文配置、Retrofit/`@GET`/`@POST`、OkHttp 拦截器、常量 host

样本：有抓包则原样保存；仅有静态结论时在 notes 写「待联调」，Phase 4A 用复现请求补样本。

**验证门：** 至少「搜索 + 目录 + 正文」有 URL 模板或等价调用约定；缺段在 notes 写阻塞原因。

---

### Phase 3A: 签名与加密还原

**目标：** 每个签名/加密字段可本地逐步算出，并能与抓包对照。

1. **Smali 优先**
   - 从 2A 的 xref 进入 `dex_method`
   - 梳理：入参顺序、拼接串、`MessageDigest` / HMAC / AES / Base64 / 自定义表
   - 常量盐/key 用 `mt_apk_search` / 邻近字段读出，写入 notes
2. **Native**（仅 smali 到 JNI）
   - ida-pro-mcp：`survey_binary` → 按导出/字符串找目标
   - `analyze_function` / `decompile` / `xrefs_to`
   - 只还原与当前接口相关的函数，结果写成伪代码步骤进 notes
3. **每个签名字段**在 notes 固定形态：  
   `输入 → 步骤（含编码/大小写）→ 输出样例`（与抓包字节级或服务端接受对照）
4. **卡住** → 停；展示已定位地址/方法与缺口，**不编造盐**；可请用户补一次带签名的完整请求

**验证门：** 写源所需签名均有可执行描述，或用户确认的真实降级（如现成 token 的获取方式）。

---

### Phase 4A: 协议复现验证

**目标：** 脱离 App 进程，用脚本打通链路，再进主文 Phase 5。

1. `tmp/<source-id>/verify.js`（或 `verify.py`）：签名 → 请求 → 断言关键字段非空
2. 依赖：Node 内置 `fetch` / Python 标准库或环境已有 `requests`；**不要**为验证强装 App 运行时
3. 对照：

| 环节      | 验证点                                 |
| --------- | -------------------------------------- |
| 搜索      | 成功状态、列表非空、可抽出 book id/url |
| 详情/目录 | 章节列表非空                           |
| 正文      | 正文非空、编码正确                     |
| 签名      | 与抓包一致，或服务端接受               |

全部 PASS → 检查合流契约 → 回主文 Phase 5。FAIL → 回 2A/3A。

## 出口：合流契约

进入主文 Phase 5 前确认：

1. `notes.md`（含签名字段：`输入→步骤→样例`）
2. 关键环节响应样本（`.json` 等）
3. verify 全 PASS；或用户确认样本-only 时 notes 标明未联调
4. 源格式意向（App 默认 **纯 JS 单文件**）

缺项不写源。

## 迁入书源时注意（Phase 5 提示）

- 签名/请求逻辑迁入 `search` / `getChapters` / `getContent`：`java.ajax`、`java.md5Encode` 等，见主文与 [[js-source-format.md]]、[[js-api.md]]
- `bookUrl` / 章节 `url` 用绝对或书源内可解析的稳定标识；勿把仅内存有效的临时对象当 url
- token 类时效头：在函数内按 3A 步骤现算或按站点规则刷新，勿写死过期值
