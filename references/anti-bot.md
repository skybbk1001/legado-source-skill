# 反爬对策

## 1. 检测模式（按优先级）

| 信号 | 反爬类型 | 对策 |
|---|---|---|
| `403` | IP 封禁 / 权限拒绝 | 检查 cookie/login / `concurrentRate` |
| `401` | 未授权 | 检查 `loginUrl` / `enabledCookieJar` |
| `429` | 频率限制 | 增大 `concurrentRate`（如 `"1000"` → `"3000"`） |
| `challenges.cloudflare.com` / `_cf_chl_opt` | CloudFlare | CF 三层绕过（见下文） |
| `content-length: 0` / 响应极短 | 空/异常页 | 检查请求头 / Referer / Cookie |
| 响应中含 `验证码` / `captcha` | 验证码 | `java.ocr()` 或 `java.getVerificationCode()` |
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

## 3. CloudFlare 三层绕过

> 上下文：代码用于 `loginCheckJs`，`java` 是 `AnalyzeUrl` 实例

```js
(() => {
  let res = result;
  const url = String(java.url || res.url());
  const cfRe = /challenges\.cloudflare\.com|_cf_chl_opt|cf-chl|challenge-platform|Just a moment/i;

  if (cfRe.test(res.body())) {
    const cfProbe = `
      (() => {
        window.__legadoCfStart ??= Date.now();
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
- WebView 在新版 CF 上可能失败（WebGL/字体检测）

## 4. 加密/签名请求

站点对请求加密或签名时，用 Playwright 调网页函数获取参数：

```js
// 在 loginCheckJs 或规则 JS 中
const encrypted = window.encryptData(keyword);  // 调网页加密函数
```

优先用网页的 CryptoJS（Legado 内置）：

```js
const c = java.createSymmetricCrypto("AES/CBC/PKCS5Padding", key, iv);
c.decryptStr(data);
```

## 5. 登录站点

```json
{
  "loginUrl": "https://site.com/login,{\"method\":\"POST\",\"body\":\"username={{username}}&password={{password}}\"}",
  "loginUi": "[{\"name\":\"username\",\"type\":\"text\"},{\"name\":\"password\",\"type\":\"password\"}]",
  "loginCheckJs": "(() => { let res = result; if (String(res.body()).includes('请先登录')) { source.removeLoginInfo(); java.toast('登录已过期'); } return res; })()"
}
```

- `loginCheckJs` 检测登录状态，失效时触发重登

## 6. 降级策略

| 主方式 | 备用方案 | 实现方式 |
|---|---|---|
| JSON API | HTML 解析 | 双写 `ruleSearch` 或 JS 内分支 |
| WebView 自动 | 手动浏览器 | `startBrowserAwait` |
| 并发请求 | 串行 + 限流 | 增大 `concurrentRate` |

## 7. 验证码

```js
// 自动识别（字母数字）
const code = java.ocr(captchaUrl);

// 手动弹窗
const code = java.getVerificationCode(captchaUrl);
```