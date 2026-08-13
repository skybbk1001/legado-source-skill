# 定时任务

## 边界

定时任务是应用级 `AutoTaskRule`，不是书源。它以五字段 Cron 触发一段阅读T JavaScript，并处理脚本返回的动作。可复用书源脚本环境中的 HTTP、登录、Cookie 与缓存能力，但不能把任务字段塞入 `BookSource`。

当前 MCP 没有定时任务管理或调试工具。交付可导入的 JSON，并要求用户在“定时任务”界面导入后使用右上角“调试”单次运行。

## 工作流

1. 明确任务目的、时区预期、频率、请求鉴权和最终动作。完成标准：每个外部请求和动作都有明确输入输出。
2. 写五字段 Cron：`分 时 日 月 周`。完成标准：表达式只使用支持的语法且与用户描述一致。
3. 写同步风格 JavaScript。需要网络时沿用 [[js-api.md]] 与 [[login.md]]；脚本最终值必须能被动作协议处理。完成标准：脚本语法通过且不会返回未支持的动作。
4. 产出单个对象或对象数组，运行 `scripts/validate-autotask.js`。完成标准：校验通过。
5. 提醒用户导入、开启定时任务服务并在 App 内调试。涉及真实接口时，未实测必须明确标注。

## Cron 契约

- 恰好五字段，不含秒和年份。
- 支持 `*`、`?`、逗号列表、`-` 范围、`/` 步长。
- 分 `0-59`，时 `0-23`，日 `1-31`，月 `1-12`，周 `0-7`；周日可写 `0` 或 `7`。
- 日期与星期同时受限时按 OR 匹配，不是 AND。例如 `30 9 1-7 * 1` 会匹配每月 1 至 7 日以及每个周一。
- 按设备本地时区运行；最小粒度一分钟。

```text
*/5 * * * *       每 5 分钟
0 9 * * *         每天 09:00
0 8,20 * * *      每天 08:00 和 20:00
*/30 6-23 * * *   06:00 至 23:00 每 30 分钟
```

## JSON 字段

```json
{
  "id": "daily-checkin",
  "name": "每日签到",
  "enable": true,
  "cron": "0 9 * * *",
  "script": "var body = java.ajax('https://example.com/checkin');\n({type:'notify', title:'每日签到', content:String(body)})",
  "header": "{\"User-Agent\":\"Mozilla/5.0\"}",
  "enabledCookieJar": true
}
```

核心字段：`id`、`name`、`enable`、`cron`、`script`。登录与请求环境字段可选：`header`、`jsLib`、`concurrentRate`、`loginUrl`、`loginUi`、`loginCheckJs`、`enabledCookieJar`、`comment`。

`lastRunAt`、`lastResult`、`lastError`、`lastLog` 是运行状态，不在新任务中伪造。

脚本可直接写 JavaScript，也兼容外层 `@js:` 或 `<js>...</js>`；新任务直接写 JavaScript。

## 返回动作

脚本可返回单个动作、动作数组或 `{ "actions": [...] }`。当前只支持 `refreshToc` 和 `notify`。

```javascript
({
  type: "refreshToc",
  bookUrl: "https://example.com/book/123",
  notify: {
    enable: true,
    minCount: 1,
    title: "《{book}》更新提醒",
    content: "新增 {newCount} 章，最新：{chapter}"
  },
  cache: { enable: false }
})
```

`refreshToc.bookUrl` 必须对应书架中书籍的绝对 `bookUrl`。通知可用 `{book}`、`{author}`、`{newCount}`、`{chapter}`、`{time}`；普通 `notify` 可用 `{task}`、`{time}`。

```javascript
({
  type: "notify",
  title: "任务完成",
  content: "{task} 已于 {time} 完成",
  level: "high",
  id: 1
})
```

## 交付门

- Cron 与用户描述一致，尤其说明日期/星期 OR 语义。
- 脚本最终值是支持的动作；仅做副作用且无需动作时也要说明 App 调试时看到什么。
- 凭据不写入产物，使用登录 UI、Cookie 或已有登录信息。
- 网络协议有样本或真实请求证据；无法联调时明确“仅语法验证”。
- `validate-autotask.js` 通过，并给出 App 内导入和调试步骤。
