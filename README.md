# legado-source-skill

为开源阅读「阅读T」（LegadoT）编写与调试规则产物的 Agent 技能：书源（声明式 JSON 源 / 纯 JS 单文件源）、定时任务（Cron + 动作协议）与 HTTP 在线朗读引擎（请求规则 + 音色候选）。

## 结构

| 路径 | 内容 |
| --- | --- |
| `SKILL.md` | 入口与主流程：产物分流 → 采集轨 → 合流契约 → 写源 → 语法验证 → App 内实测 |
| `references/` | 专题参考 12 篇：两条采集工作流（`workflow-web` / `workflow-app`）、两种源格式契约（`js-source-format` / `fields`）、规则语法、JS API、登录、反爬、排障、骨架、定时任务、HTTP 朗读引擎 |
| `scripts/` | Node 内置模块校验器（无 npm 依赖） |
| `evals/` | 技能评估用例（prompt + expected_output + 示例产物） |

## 校验器

在 skill 根目录执行，仅依赖 Node 内置模块：

```bash
node scripts/validate-booksource.js <booksource.json>
node scripts/validate-jssource.js <source.js>
node scripts/validate-autotask.js <task.json>
node scripts/validate-http-tts.js <http-tts.json>
```

## 文档约定

- **wikilink 相对当前文件**：`SKILL.md` 内用 `[[references/xxx.md]]`；`references/` 内互相引用用 `[[xxx.md]]`，指向主文用 `[[../SKILL.md]]`。
- **术语**：「主文」= `SKILL.md`；「合流契约」= 进入主文 Phase 5 前 `tmp/<source-id>/` 须齐备的四项产物清单（唯一权威定义在主文，各采集轨只列轨内附加项）。
- **引擎行为边界锚定 App 探针**：JS 兼容面、字符串两型等运行时事实标注探针位置（如 `JsTest.javaStringInteropBoundary`、`JsTest.kt#es6CompatBoundary`），引擎升级后按探针重测再更新文档。
- **中间产物**：采集阶段落盘 `tmp/<source-id>/`，交付前删除敏感数据。

## evals

`evals/evals.json` 每条含 `prompt` 与 `expected_output`，覆盖路由分流、格式契约、Rhino 兼容面、登录/Cron/TTS 边界等；`valid-autotask.json` / `valid-http-tts.json` 是校验器应通过的示例产物。新增行为或契约变更时同步补一条 eval。

## 许可

GPL-3.0，与主仓库 legado 一致。
