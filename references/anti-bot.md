# 反爬对策

## 1. 检测模式（按优先级）

| 信号 | 反爬类型 | 对策 |
|---|---|---|
| `403` | IP 封禁 / 权限拒绝 | 检查 cookie/login / `concurrentRate` |
| `401` | 未授权 | 检查 `loginUrl` / `enabledCookieJar` |
| `429` | 频率限制 | 增大 `concurrentRate`（如 `"1000"` → `"3000"`） |
| `challenges.cloudflare.com` / `_cf_chl_opt` | CloudFlare | CF 三层绕过（见下文） |
| 响应 <200字节 + 仅含 `<script>` | JS 挑战页 | loginCheckJs 或 webView 模式（见下文） |
| `content-length: 0` / 响应极短 | 空/异常页 | 检查请求头 / Referer / Cookie |
| 响应中含 `验证码` / `captcha` | 验证码 | `java.getVerificationCode()` 手动输入 |
| 响应含加密数据 | 加密/签名 | 调网页函数抓参数 |

## 2. 基础防护（所有站点优先尝试）

```json
{
  "header": "{\"User-Agent\": \"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36\"}",
  "enabledCookieJar": true,
  "concurrentRate": "1000"
}
```

- `header`：浏览器 UA 避免被识别为爬虫
- `enabledCookieJar`：自动保存 session
- `concurrentRate`：请求间隔（毫秒）

### 常见请求头

```json
{
  "header": "{\"User-Agent\": \"Mozilla/5.0\", \"Referer\": \"https://site.com\", \"Origin\": \"https://site.com\", \"Accept\": \"application/json\"}"
}
```

| 头 | 用途 |
|---|---|
| `User-Agent` | 浏览器伪装 |
| `Referer` | 来源检查（图片/API 常用） |
| `Origin` | CORS 检查 |
| `Accept` | 内容协商 |

## 3. CloudFlare 会话获取

> 上下文：代码用于 `loginCheckJs`，`java` 是 `AnalyzeUrl` 实例

```js
(() => {
  let res = result;
  const url = String(java.url || res.url());
  const cfRe = /challenges\.cloudflare\.com|_cf_chl_opt|cf-chl|challenge-platform|Just a moment/i;

  if (cfRe.test(res.body())) {
    const cfProbe = `
      (() => {
        if (!window.__legadoCfStart) window.__legadoCfStart = Date.now();
        const maxWait = 6000;
        const blocked = window._cf_chl_opt ||
          document.querySelector('script[src*="challenge-platform"],script[src*="challenges.cloudflare.com"]');
        if (blocked && Date.now() - window.__legadoCfStart < maxWait) return null;
        return document.documentElement.outerHTML;
      })()
    `;
    const webHtml = java.webView(null, url, cfProbe);

    if (webHtml && !cfRe.test(String(webHtml))) {
      res = java.connect(url + ',{"webView":true}');
    } else {
      cookie.removeCookie(url);
      java.toast("需要验证CloudFlare，请在浏览器中完成验证");
      if (key != null) {
        java.startBrowser(url, "CloudFlare验证");
        return res;
      }
      res = java.startBrowserAwait(url, "CloudFlare验证", true) || java.getStrResponse();
    }
  }

  return res;
})();
```

### 最佳实践

- 搜索用 `startBrowser`（非阻塞），详情/目录/正文用 `startBrowserAwait`
- 追踪拦截次数，限 2 次转手动
- WebView 在新版 CF 上可能失败（WebGL/字体检测）；此时只能让用户在浏览器中完成验证，不能承诺自动绕过。

## 4. JS 挑战页

站点返回JS质询/挑战，页面仅含一个 `<script>` 做浏览器指纹探测，curl 拿不到真实内容。

### 方案 A：loginCheckJs 全局拦截

所有请求都会过 `loginCheckJs`，检测到挑战页就用 WebView 拿 cookie 再重试：

```js
(() => {
  let res = result;
  // 检测挑战页标记（根据目标站点调整）
  if (/挑战页特征标记/.test(res.body())) {
    java.initUrl();                                       // 重置请求上下文
    java.webView(null, java.ruleUrl, "document.cookie");  // WebView 通过挑战，拿 cookie
    result = java.getStrResponse();                       // 带 cookie 重新请求
  }
  return result;
})();
```

- 通用性强，所有请求（搜索/详情/目录/正文）都能自动处理
- `java.initUrl()` + `java.getStrResponse()` 仅在 `loginCheckJs` 中可用（`java` 是 `AnalyzeUrl`）

### 方案 B：webView 模式

URL 加 `webView:true` 参数，直接走 WebView 发请求：

```json
{
  "searchUrl": "https://site.com/search?q={{key}}&page={{page}},{\"webView\":true}"
}
```

- 最简方案，零代码

### 选择建议

| 场景 | 推荐 |
|---|---|
| 单页需要绕过 | 方案 B |
| 多个环节都遇到挑战页 | 方案 A |
| 挑战页有复杂验证（如滑块） | 方案 A + `startBrowserAwait` 手动验证 |

## 5. 加密/签名请求

**场景 A：网页有加密函数** — 用 WebView 调网页自己的 JS 函数获取加密参数：

```js
// 通过 webView 执行网页JS，调用其加密函数
const encrypted = java.webView(null, url, "window.encryptData('" + keyword + "')");
```

**场景 B：需要在 Legado 内加解密** — 用 Legado 内置 API 处理网页返回的加密数据：

```js
// 对称加密（AES/DES/Blowfish）
const c = java.createSymmetricCrypto("AES/CBC/PKCS5Padding", key, iv);
c.decryptStr(data);        // 解密 → String
c.encryptHex(data);        // 加密 → Hex

// 哈希
java.md5Encode(str);       // MD5
java.digestHex(data, "SHA-256");  // SHA-256
java.HMacHex(data, "HmacSHA256", key);  // HMAC
```

详见 [[js-api.md]] §加密。

## 6. 认证态与反爬联动

登录 UI、登录态保存和多步登录协议见 [[login.md]]。本节只处理认证失败与反爬
挑战同时出现的场景：

| 现象 | 优先判断 | 处理 |
|---|---|---|
| `401` 或“请先登录” | 登录态失效 | 清理登录信息并让用户重新登录 |
| `403` 且登录态有效 | Referer、频率、IP 或权限 | 对比请求头、放慢请求，不要盲目重登 |
| 登录页/接口返回 CF 或 JS 挑战 | 认证流程被反爬拦截 | 按本文件的 WebView/浏览器降级处理 |
| 登录成功但业务接口仍拒绝 | Cookie/header 未保存或作用域不对 | 开启 Cookie Jar，检查登录头和实际请求 |

不要把浏览器抓到的业务 Cookie、挑战 Cookie 或 token 硬编码到源中。登录完成后
必须用一个需要认证的业务请求验证状态。

## 7. 降级策略

| 主方式 | 备用方案 | 实现方式 |
|---|---|---|
| JSON API | HTML 解析 | 双写 `ruleSearch` 或 JS 内分支 |
| WebView 自动 | 手动浏览器 | `startBrowserAwait` |
| 并发请求 | 串行 + 限流 | 增大 `concurrentRate` |

## 8. 验证码

```js
// 手动弹窗，用户肉眼输入
const code = java.getVerificationCode(captchaUrl);
```
