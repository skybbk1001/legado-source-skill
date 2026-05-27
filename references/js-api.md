# JavaScript API 参考

Legado 内嵌 Rhino JS 引擎（htmlunit-core-js），无浏览器 DOM/Window/fetch 等 API，但内置Crypto-js支持。
字符串判空用 `String()` 包裹：java 返回的空字符串在 js 里转布尔值为 true。

**jsLib 上下文**：无 java/cache/cookie 等全局变量，函数需要从 this 解构：
```js
// jsLib 中
function getBook(url) {
  const { java } = this;  // 必须从 this 解构
  return java.log(url);
}
```

## ES6+ 兼容性

Rhino 支持大部分 ES6+：

| ✅ 完全支持 | ❌ 不支持 | 替代方案 |
|---|---|---|
| `let` / `const` | `class` | function + prototype |
| 箭头函数 `=>` | `async` / `await` | Promise 链 |
| 模板字符串 `` ` `` | 数组剩余解构 `[a, ...b]` | `b = arr.slice(1)` |
| 解构 `{a, b}` / `[a, b]` | 函数调用展开 `fn(...arr)` | `fn.apply(null, arr)` |
| 默认参数 `(x = 1)` | | |
| 剩余参数 `function(...args)` | | |
| 展开 `[...a]` / `{...o}` | | |
| `for...of` | | |
| `?.` 可选链 | | |
| `??` 空值合并 | | |
| `&&=` / `||=` / `??=` | | |
| `Map` / `Set` / `Symbol` | | |
| `Promise`（构造函数） | | |
| 所有 `Array.*` / `String.*` / `Object.*` ES6 方法 | | |
| `BigInt` / `globalThis` | | |

## 全局变量（上下文相关）

| 变量 | 类型 | 可用范围 |
|---|---|---|
| `java` | AnalyzeRule 或 AnalyzeUrl | 所有规则 |
| `result` | Any | 所有规则（上一步的输出） |
| `src` | String | 所有规则（原始页面源码） |
| `baseUrl` | String | 所有规则（当前页面 URL） |
| `book` | Book? | 书籍信息、目录、正文规则 |
| `chapter` | BookChapter? | 正文规则 |
| `source` | BaseSource | 所有规则 |
| `title` | String | 正文规则（当前章节标题） |
| `nextChapterUrl` | String? | 正文规则（翻页正文） |
| `cookie` | CookieStore | 所有规则 |
| `cache` | CacheManager | 所有规则 |
| `key` | String? | 搜索规则 + loginCheckJs（搜索外为 null） |
| `page` | Int | 搜索/目录规则（当前页码） |

规则 JS 中 `java` 是 `AnalyzeRule`。`loginCheckJs` 中是 `AnalyzeUrl`（可访问 `java.initUrl()` / `java.getStrResponse()`）。

## 网络请求

```js
java.ajax(urlStr): String
java.ajaxAll(urlList: Array<String>): Array<StrResponse>

//返回StrResponse 方法body() code() message() headers() raw() toString() 
java.connect(urlStr): StrResponse

// GET 带请求头（不跟随跳转）→ Connection.Response
java.get(url, { Referer: "..." });               // Map
java.get(url, '{"Referer": "..."}');             // JSON 字符串

// HEAD 请求（无响应体）→ Connection.Response
java.head(url, { Referer: "..." });              // Map
java.head(url, '{"Referer": "..."}');            // JSON 字符串

// POST（不跟随跳转）→ Connection.Response
java.post(url, body, { "Content-Type": "x-www-form-urlencoded" });
java.post(url, body, '{"Content-Type": "..."}');
```

## WebView

需要 JS 执行的页面。JS 参数通过 `evaluateJavascript` 求值 — 返回值即结果。若结果为空/null，每 1 秒轮询，最多 30 秒：

```js
// 使用webView访问网络
// @param html 直接用webView载入的html, 如果html为空直接访问url
// @param url html内如果有相对路径的资源不传入url访问不了
// @param js 用来取返回值的js语句, 没有就返回整个源代码
// @return 返回js获取的内容
java.webView(html: String?, url: String?, js: String?): String?

// 使用webView获取跳转url
java.webViewGetOverrideUrl(html: String?, url: String?, js: String?, overrideUrlRegex: String): String?

// 使用webView获取资源url
java.webViewGetSource(html: String?, url: String?, js: String?, sourceRegex: String): String?

// 使用内置浏览器打开链接，可用于获取验证码 手动验证网站防爬
// @param url 要打开的链接
// @param title 浏览器的标题
java.startBrowser(url: String, title: String)

// 使用内置浏览器打开链接，并等待网页结果 .body()获取网页内容
java.startBrowserAwait(url: String, title: String, refetchAfterSuccess: Boolean? = true): StrResponse
```

## 加密

### 哈希与编码

```js
java.md5Encode(str);                     // 32 字符
java.md5Encode16(str);                   // 16 字符
java.digestHex(data, "SHA-256");         // 任意摘要 → hex
java.digestBase64Str(data, "SHA-256");   // 任意摘要 → base64
java.HMacHex(data, "HmacSHA256", key);
java.HMacBase64(data, "HmacSHA256", key);

java.base64Decode(str);                  // → String
java.base64DecodeToByteArray(str);       // → ByteArray
java.base64Encode(str);                  // → String

java.hexDecodeToByteArray(hex);          // → ByteArray
java.hexDecodeToString(hex);             // → String
java.hexEncodeToString(utf8);            // → String
```

### 对称加密

注：优先使用网页的 CryptoJS（Legado 内置）。

```js
const c = java.createSymmetricCrypto("AES/CBC/PKCS5Padding", key, iv);
c.decryptStr(data);        // → String
c.decrypt(data);           // → ByteArray
c.encryptBase64(data);     // → Base64
c.encryptHex(data);        // → Hex
```

`key`/`iv`：String（UTF-8）或 ByteArray。

### 非对称加密

```js
const c = java.createAsymmetricCrypto("RSA");
c.setPublicKey(key);
c.setPrivateKey(key);
c.decryptStr(data);
c.encryptBase64(data);
```

### 签名

```js
const s = java.createSign("SHA256withRSA");
s.setPrivateKey(key);
s.signHex(data);           // → Hex
```

## 解析辅助

```js
// 对内容执行 Legado 规则
java.getString(ruleStr);                   // 对当前页面
java.getString(ruleStr, customContent);    // 对自定义内容
java.getString(ruleStr, url, true);        // 先取 URL 再应用规则
java.getStringList(ruleStr);              // → Array<String>
java.setContent(content, baseUrl);         // 切换解析上下文
java.getElement(ruleStr);                 // → 单个 Element
java.getElements(ruleStr);                // → Array<Element>
```

## 文本处理

```js
java.encodeURI(str);                 // URL 编码（UTF-8）
java.toURL(urlStr);                  // 解析 URL → { url, host, path, queryMap, ... }
java.toURL(url, baseUrl);            // 解析相对 URL
java.t2s(text);                      // 繁体 → 简体
java.s2t(text);                      // 简体 → 繁体
java.htmlFormat(str);                // 清理 HTML
java.strToBytes(str);                // String → ByteArray
java.bytesToStr(bytes);              // ByteArray → String
```

## 图片与字体

```js
// OCR（中文模型）
java.ocr(url);                       // 标准
java.ocr(url, "raw");               // raw
java.ocr(url, "line");              // 行分割
java.ocr(url, "captcha");           // 验证码（仅字母数字）

// 手动验证码弹窗
java.getVerificationCode(imageUrl);

// 字体反爬
const f1 = java.queryTTF(base64FontData);
const f2 = java.queryTTF("https://example.com/font.ttf");
java.replaceFont(result, f1, f2, true);  // true = 过滤无映射字形
```

## 存储与缓存

```js
// 每个书源（持久化）
java.put(key, value);
java.get(key);

// 每个书源（会话，通过 source 对象）
source.put(key, value);
source.get(key);

// Cookie
cookie.getCookie(url);
cookie.getKey(url, "session_id");
cookie.setCookie(url, "key=value");
cookie.removeCookie(url);

// 持久缓存（数据库，50MB）
cache.put(key, value, saveTimeSeconds);
cache.get(key);
cache.delete(key);

// 文件缓存（大内容）
cache.putFile(key, value, saveTimeSeconds);
cache.getFile(key);

// 内存缓存（仅会话）
cache.putMemory(key, value);
cache.getFromMemory(key);
```

## 文件操作

路径相对于应用缓存目录。

```js
java.downloadFile(url);              // → 本地路径
java.readTxtFile(path);              // → String（自动检测编码）
java.readTxtFile(path, "GBK");       // → String（指定编码）
java.deleteFile(path);

// 从网络缓存文本文件（saveTime 秒后自动刷新）
java.cacheFile(url);                 // 永久缓存
java.cacheFile(url, 3600);           // 缓存 1 小时 → String

// 从网络或本地文件导入 JS
java.importScript("https://example.com/lib.js"); // 网络
java.importScript("lib.js");                     // 本地缓存目录

// 压缩包
java.unzipFile(zipPath);            // → 解压目录
java.unrarFile(zipPath);
java.un7zFile(zipPath);
java.unArchiveFile(zipPath);        // 自动检测类型
java.getTxtInFolder(dirPath);       // 所有 .txt → String

// 远程压缩包
java.getZipStringContent(zipUrl, innerPath);
java.getZipByteArrayContent(zipUrl, innerPath);
java.getRarStringContent(zipUrl, innerPath);
java.getRarByteArrayContent(zipUrl, innerPath);
java.get7zStringContent(zipUrl, innerPath);
java.get7zByteArrayContent(zipUrl, innerPath);
```

## UI 与浏览器

```js
java.toast("message");
java.longToast("message");
java.log("debug");
java.logType(variable);              // 输出类型和值
java.startBrowser(url, "Title");     // 内置浏览器，不等结果
java.startBrowserAwait(url, "Title"); // 浏览器，等结果 → StrResponse
java.startBrowserAwait(url, title, refetchAfterSuccess); // 第三参数控制是否自动重新获取
java.showBrowser(url, html?, preloadJs?, config?); // 显示内置浏览器，用户手动操作
java.openUrl(url);                   // 外部浏览器
java.openUrl(url, mimeType);         // 带 MIME 类型提示打开
java.copyText(text);                 // 复制到剪贴板
java.randomUUID();                   // → String
java.androidId();                    // → 设备 Android ID
java.toNumChapter("第123章");        // 规范化章节号 → "第123章"
java.getWebViewUA();                 // → WebView 默认 User-Agent 字符串
```

## loginCheckJs 上下文

`java` 是 `AnalyzeUrl`，可用 `java.initUrl()` / `java.getStrResponse()` / `key`。普通规则中是 `AnalyzeRule`，无这些方法。

## Source 与登录

```js
source.getKey();                     // → bookSourceUrl
source.getLoginInfo();               // → 所有登录表单值
source.getLoginInfoMap().get("username");
source.removeLoginInfo();
source.getLoginHeader();
source.putLoginHeader("Cookie: session=xxx");
source.removeLoginHeader();
source.setVariable("value");
source.getVariable();
```

## AnalyzeRule 上下文

`ruleToc.preUpdateJs` 中可用（AnalyzeRule 置 `preUpdateJs=true`）：

```js
// 重新从详情页获取目录 URL → 更新 book.tocUrl
java.refreshTocUrl();

// 用书名+作者重新搜索 → 更新 book.bookUrl 和变量
java.reGetBook();
```

规则 JS 和 `preUpdateJs` 中可用：

```js
// 设置/获取局部变量（会话范围，规则求值后清除）
java.set("key", "value");
java.get("key");                     // 读取通过 @put: 或 setLocal 设置的变量
```

## Book 与 Chapter

```js
// 最常用：
book.name;           // 书名
book.author;         // 作者
book.bookUrl;        // 详情页 URL
book.tocUrl;         // 目录 URL
book.coverUrl;       // 封面图
book.intro;          // 简介
book.kind;           // 分类
book.variable;       // 自定义变量
book.durChapterIndex; // 当前章节索引

chapter.title;       // 章节标题
chapter.url;         // 章节 URL
chapter.index;       // 章节序号
chapter.baseUrl;     // 相对链接基地址
```

## 常见模式

### 重定向搜索（POST → 302）

```js
(function() {
  if (page === 1) {
    const url = `https://x.com/e/search/index.php,${JSON.stringify({
      method: "POST",
      body: `show=title&keyboard=${key}`
    })}`;
    return source.put("surl", String(java.connect(url).raw().request().url()));
  }
  return `${source.get("surl")}&page=${page - 1}`;
})();
```

### 从 API ID 构建 URL

```
$.bookId@js:`https://www.example.com/book/${result}`
```

### 图片带 Referer 头

```js
const opts = { headers: { Referer: baseUrl } };
`<img src="${src},${JSON.stringify(opts)}">`;
```

### AES 图片解密（imageDecode）

```js
java.createSymmetricCrypto("AES/CBC/PKCS5Padding", key, iv).decrypt(result);
```

### XOR 图片解密（imageDecode）

```js
function decodeImage(data, key) {
  const input = new java.io.ByteArrayInputStream(data);
  const out = new java.io.ByteArrayOutputStream();
  let byte;
  while ((byte = input.read()) !== -1) { out.write(byte ^ key); }
  return out.toByteArray();
}
decodeImage(result, key);
```

### 字体反爬（replaceRegex）

```js
<js>
(() => {
  const b64 = String(src).match(/ttf;base64,([^\)]+)/);
  if (b64) {
    const f1 = java.queryTTF(b64[1]);
    const f2 = java.queryTTF("https://example.com/font.ttf");
    return java.replaceFont(result, f1, f2, true);
  }
  return result;
})();
</js>
```

### 回调事件（callBackJs，需 eventListener:true）

```js
(function() {
  if (event === "clickCustomButton") {
    java.startBrowser(`https://example.com/chapter?id=${chapter?.index}`);
  }
  if (event === "clickShareBook") {
    result = String(result).replace(/广告/g, "");
    return false;  // 不拦截默认行为
  }
})();
```

### 时间格式化

```js
java.timeFormat(timestamp);                      // 自动
java.timeFormatUTC(time, "yyyy-MM-dd", 8);       // UTC + 时区偏移
```
