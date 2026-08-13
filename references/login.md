# 登录协议

登录是认证交互协议，不等同于反爬。书源先选择登录形态，再根据登录后的
`401`、未登录提示、Cookie 失效或挑战页配置反爬联动。字段总览见
[[fields.md]]，JS 源完整契约见 [[js-source-format.md]]。

## 1. 登录形态

| 形态 | 配置 | 适用场景 |
|---|---|---|
| WebView 登录 | 仅 `loginUrl` | 站点提供完整登录页、需要复杂前端交互或第三方登录 |
| 静态表单登录 | `loginUi` + `login` | 用户名/密码等固定字段，提交逻辑可由书源直接完成 |
| 动态状态 UI | `loginUi(state)` + `loginAction(action, state, form)` | 短信验证码、分步登录、图形验证码、动态字段 |

不要同时为同一流程实现多个互相竞争的入口。需要网页交互时选 WebView；请求
协议可以在书源内复现时，优先使用表单或动态状态 UI。

## 2. WebView 登录

只声明 `config.loginUrl`：

```js
const config = {
  bookSourceUrl: "https://example.com",
  bookSourceName: "示例登录站",
  loginUrl: "https://example.com/login",
};
```

适用于密码登录、扫码登录、第三方登录和必须执行网页 JavaScript 的流程。登录
完成后由应用保存 Cookie 或登录头，后续请求通过同一来源的认证状态发送。

如果登录页本身被 CF、滑块或设备验证拦截，按 [[anti-bot.md]] 的反爬升级阶梯
处理；不要把一次浏览器得到的 Cookie 硬编码到源中。

## 3. 静态表单登录

声明式 JSON 源示例：

```json
{
  "loginUrl": "https://example.com/login,{\"method\":\"POST\",\"body\":\"username={{username}}&password={{password}}\"}",
  "loginUi": "[{\"name\":\"username\",\"type\":\"text\"},{\"name\":\"password\",\"type\":\"password\"}]"
}
```

纯 JS 源需要配置 `loginUi` 并实现顶层 `login()`：

```js
const config = {
  bookSourceUrl: "https://example.com",
  bookSourceName: "示例登录站",
  loginUi: [
    { name: "username", type: "text" },
    { name: "password", type: "password" },
  ],
};

function login() {
  const form = JSON.parse(source.getLoginInfo());
  const body = `username=${java.encodeURI(form.username)}&password=${java.encodeURI(form.password)}`;
  const response = java.post(
    "https://example.com/api/login",
    body,
    { "Content-Type": "application/x-www-form-urlencoded" }
  );
  const data = JSON.parse(String(response.body()));
  if (!data.ok) throw new Error(data.message || "登录失败");
  source.putLoginHeader(JSON.stringify({ Authorization: `Bearer ${data.token}` }));
}
```

约束：

- `loginUi` 每项必须有非空 `name`；`name` 同时是显示名称和表单数据键。
- `type` 常用 `text`、`password`；按钮项使用 `type: "button"`。
- 静态表单声明了 `loginUi` 就必须实现 `login`，否则导入或保存校验失败。
- `source.getLoginInfo()` 返回 AES 存储的 JSON 字符串；不要把密码写入日志或缓存。
- 登录成功后用 `source.putLoginHeader(json)` 保存登录头；其中 `Cookie` 会同步到
  CookieStore。只有在服务端确实返回对应值时才保存 Cookie 或 token。

## 4. 动态状态 UI

动态 UI 使用显式状态协议。纯 JS 源在顶层实现两个函数；声明式源将两个函数
放入 `loginUrl` 的 JS，并把 `loginUi` 设置为 `{\"version\":2}`。

```js
function loginUi(state) {
  if (!state.step) {
    return {
      rows: [
        { key: "phone", name: "手机号", type: "text" },
        { name: "发送验证码", type: "button", action: "sendCode" },
      ],
    };
  }
  return {
    rows: [
      { key: "code", name: "验证码", type: "text" },
      { name: "重新发码", type: "button", action: "sendCode", countdown: 60 },
      { name: "登录", type: "button", action: "verify" },
    ],
  };
}

function loginAction(action, state, form) {
  if (action === "sendCode") {
    const response = JSON.parse(java.ajax(
      `https://example.com/sms?phone=${java.encodeURI(form.phone)}`
    ));
    if (!response.ok) return { error: { phone: response.message || "发送失败" } };
    return { state: { step: "code", phone: form.phone } };
  }

  if (action === "verify") {
    const response = JSON.parse(java.ajax(
      `https://example.com/verify?phone=${java.encodeURI(state.phone)}&code=${java.encodeURI(form.code)}`
    ));
    if (!response.ok) return { error: { code: response.message || "验证码错误" } };
    return {
      login: { Authorization: `Bearer ${response.token}` },
      close: true,
    };
  }

  return { error: { _form: "未知操作" } };
}
```

### 4.1 UI 返回值

`loginUi(state)` 返回 UI 描述。`rows` 是按顺序渲染的行：

| 行类型 | 必填 | 说明 |
|---|---|---|
| `text` | `key`、`name` | 普通输入框 |
| `password` | `key`、`name` | 密码输入框 |
| `label` | `name` | 只读提示文字 |
| `select` | `key`、`name`、`options` | 单选下拉框，值为选项字符串 |
| `toggle` | `name`；参与数据时还需 `key` | 开关，值为字符串 `"true"`/`"false"`；可选 `action` 在切换时派发 |
| `button` | `name`、`action` | 调用 `loginAction`；可选 `countdown` 秒数 |

`key` 必须稳定且唯一。只有当前页面中带 `key` 的输入、单选和开关行进入
`form = {key: 当前值}`；不带 `key` 的行只显示。切到二级页面后，已消失的一级字段
不在下一次 action 的 `form` 中，跨步骤所需值应由一级 action 放入 `state`。
回填优先级为行的 `value` > 本次弹窗已输入 > 已存登录信息同 key 值；固定 `value`
会覆盖已存值。UI 函数只负责根据 state 生成界面，不要在其中发请求或写登录信息。

### 4.2 action 返回值

`loginAction(action, state, form)` 的命令对象只执行返回的命令：

| 键 | 作用 |
|---|---|
| `state` | 整体替换状态并重新渲染 UI；弹窗关闭后状态丢弃 |
| `error` | 按字段显示错误；`_form` 表示表单级错误 |
| `login` | 整体覆盖 AES 登录信息；重新打开时按 key 回填，不保存登录头 |
| `close` | 关闭登录 UI；通常与成功的 `login` 一起返回 |

常见返回组合：

- 发码成功：`{ state: { step: "code", phone: ... } }`
- 字段错误：`{ error: { code: "验证码错误" } }`
- 登录成功：`{ login: { Cookie: "..." }, close: true }`

`state` 只保存继续下一步所需的非敏感值，例如手机号、地区或流程 ID。密码、
验证码和完整响应不要放进 state、日志或 `cache`。

`login` 不是增量合并：只返回 `{ login: { remember: form.remember } }` 会覆盖原有账号、
token 等登录信息。需要保留的字段必须一并返回；认证 header 另用
`source.putLoginHeader(json)` 保存。toggle 也不自动持久化，只有被放进 `login` 对象才会保存。

### 4.3 特殊交互

- `java.toast(message)`：显示短提示。
- `java.startBrowser(url, title)`：跳转到外部网页完成登录或授权。
- `java.getVerificationCode(imageUrl)`：弹窗让用户手动输入图形验证码。
- 按钮的 `countdown` 由应用在 action 成功返回后启动；发码失败时不要返回成功状态。

## 5. 登录态保存与失效

登录成功不能只依赖 UI 关闭，必须保存后续请求需要的认证信息：

1. Cookie 会话：开启 `enabledCookieJar`，让应用保存服务端 Set-Cookie。
2. Header/token：使用 `source.putLoginHeader(JSON.stringify(headers))` 保存动态头。
3. 两者都需要：同时保存 Cookie 与 header，并用一次已登录接口验证。

登录校验必须使用真实的失效证据：HTTP `401`、明确的登录错误码、登录页跳转或
响应中的“请先登录”。不要仅凭正文为空判定失效。

声明式源可用 `loginCheckJs` 检查每次响应，并且必须返回 `result`：

```js
(() => {
  const res = result;
  const body = String(res.body());
  if (res.statusCode === 401 || /请先登录|登录已过期/i.test(body)) {
    source.removeLoginInfo();
    java.toast("登录已过期，请重新登录");
  }
  return res;
})()
```

纯 JS 源的请求由函数自己发出，`config.loginCheckJs` 不会自动包裹这些请求；应
在 `search`、`getBookInfo`、`getChapters` 或 `getContent` 中检查返回值，发现失效
时调用 `source.removeLoginInfo()` 并抛出可理解的错误。

## 6. 与反爬联动

登录和反爬应按以下顺序判断：

1. `401` 或明确未登录：检查登录信息、Cookie Jar 和登录头。
2. `403` 且登录信息有效：检查 Referer、Origin、频率和 IP 封禁，不要立即重登。
3. CF/JS 挑战页：按 [[anti-bot.md]] 处理挑战；不要把挑战 Cookie 写死。
4. 登录页要求滑块、扫码或第三方授权：切换 WebView 或 `startBrowserAwait`，完成后
   回到同一登录态验证。

登录 UI 只解决“用户如何完成认证”，不负责自动绕过挑战。任何验证码、滑块或设备
验证都应保留用户参与，并记录实际验证过的降级级别。

## 7. 验证清单

- 首次打开 UI：字段顺序、类型和默认值正确。
- 错误输入：字段错误显示在对应字段，表单级错误不丢失。
- 分步流程：state 能进入下一步，关闭弹窗后不会残留敏感数据。
- 登录成功：Cookie/header 已保存，搜索或详情请求确实带上认证信息。
- 登录失效：能识别真实失效响应并清理旧登录信息。
- 重登：重新打开登录 UI 不会回填密码、验证码或旧 token。
- 挑战页：不把浏览器抓到的业务 Cookie 硬编码到源中。
