# 反爬绕过：CloudFlare 人机验证

> **上下文**：本文件所有代码用于 `loginCheckJs`，运行在 `AnalyzeUrl.evalJS()` 中。此上下文中 `java` 是 `AnalyzeUrl` 实例，可访问 `java.initUrl()` 和 `java.getStrResponse()`；搜索关键词用独立变量 `key` 读取。详见 `references/js-api.md` §loginCheckJs 上下文。

## 检测与处理流程

```
请求 URL
  │
  ▼
检查响应 ──► 正常页面？ ──► 放行
  │
  ▼
是否人机验证拦截？
（响应体含 challenges.cloudflare.com 或 _cf_chl_opt）
  │
  ├── 是 → 第一层：WebView JS 挑战
  │           │
  │           ├── 成功 → java.connect(url + ',{"webView":true}')
  │           │            共享同一个 CookieManager，cookie 直接可用
  │           │
  │           └── 失败 → 第二层：内置浏览器（手动）
  │                          │
  │                          └── 用户完成验证 → 完成
  │
  ▼
放行
```

## 完整 `loginCheckJs` 模板

生成书源时，检测到 CloudFlare、Turnstile 或类似验证页，使用此模板。**整段用 IIFE 包住，最后返回 `StrResponse`**，避免 Rhino 报"函数外使用 return"。

```js
(() => {
  let res = result;
  const url = String(java.url || res.url());
  const cfRe = /challenges\.cloudflare\.com|_cf_chl_opt|cf-chl|challenge-platform|Just a moment/i;

  // 第一层：检测拦截
  if (cfRe.test(res.body())) {
    // 第二层：WebView JS 挑战
    const cfProbe = `
      (() => {
        window.__legadoCfStart ??= Date.now();
        const maxWait = 12000;
        const blocked = window._cf_chl_opt ||
          document.querySelector('script[src*="challenge-platform"],script[src*="challenges.cloudflare.com"]');
        if (blocked && Date.now() - window.__legadoCfStart < maxWait) return null;
        return document.documentElement.outerHTML;
      })()
    `;
    const webHtml = java.webView(null, url, cfProbe);

    if (webHtml && !cfRe.test(String(webHtml))) {
      // WebView 验证成功 → 用 connect() 复用 cookie（见下方原理说明）
      res = java.connect(url + ',{"webView":true}');
    } else {
      // 第三层：内置浏览器手动验证
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

## 原理解释

### 三层防御

| 层级 | 方法 | 原理 | 适用 |
|---|---|---|---|
| **检测** | 正则匹配响应体 | 人机验证系统注入独有脚本（`challenges.cloudflare.com`、`_cf_chl_opt` 等） | 所有 CF 站点 |
| **WebView 挑战** | `java.webView()` + JS 轮询 | WebView 执行 CF 的 JS 挑战，每 1 秒检查结果，最长等 12 秒 | 大多数 CF 站点 |
| **内置浏览器** | `java.startBrowser()` / `java.startBrowserAwait()` | 用户手动完成验证，获得长期 session | WebView 失败时兜底 |

### Cookie 同步竞态（为什么用 `connect()` 而不是 `getStrResponse()`）

```
WebView 的 CookieManager ──(Coroutine.async fire-and-forget)──> CookieStore DB
                                                                    ↑
java.getStrResponse() ──(setCookie 读取)───────────────────────────┘
                              存在竞态：异步写入可能未完成
```

`java.webView()` 完成验证后，`cf_clearance` cookie 存在 Android `CookieManager` 单例中。`BackstageWebView` 通过 `Coroutine.async`（不等待）异步同步到 `CookieStore` DB。此时如果调用 `java.getStrResponse()`，它走 OkHttp 从 `CookieStore` 读取——异步写入可能未完成，再次被拦。

**解决方案**：`java.connect(url + ',{"webView":true}')` 创建第二个 WebView，`CookieManager.getInstance()` 是进程级单例，直接共享第一个 WebView 的 cookie，无需等异步同步。

### 搜索场景的特殊处理

搜索场景用 `startBrowser`（非阻塞）打开浏览器后返回当前响应，用户验证完成后重试搜索；`startBrowserAwait` 会阻塞，易被搜索外层 30 秒超时取消。详情、目录、正文等非搜索场景用 `startBrowserAwait`。

### 最佳实践

- 用 `source.put`/`source.get` 追踪拦截次数，反复失败跳到手动回退
- 自动失败转手动前再清 cookie（一开始就清会删掉 `cf_clearance`）
- 自动化重试过多会触发 IP 封禁 → 限 2 次转手动
- WebView 在较新 CF 版本上可能失败（WebGL/字体指纹检测）
