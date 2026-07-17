# JavaScript API 参考

Legado 内嵌 Rhino JS 引擎（htmlunit-core-js），无浏览器 DOM/Window/fetch 等 API，但内置Crypto-js支持。
字符串两型（2026-07-17 探针锚定 `JsTest.javaStringInteropBoundary`）：`result`/`key` 等裸绑定值是 JS 原生字符串；经成员访问取得的（`book`/`chapter`/`source` 属性、`java.*` 返回值、Jsoup 元素方法）是 Java 包装对象——空串为真值、`typeof` 为 object、`===` 与同文本 JS 字符串不等、正则 `replace` 重载歧义报错、`split` 走 Java 语义。用 JS 字符串方法与判空前先 `String(...)` 归一化。

**jsLib 上下文**：无 java/cache/cookie 等全局变量，函数需要从 this 解构：
```js
// jsLib 中
function getBook(url) {
  const { java } = this;  // 必须从 this 解构
  return java.log(url);
}
```

## ES6+ 兼容性

Rhino 支持大部分 ES6+（下表基于引擎探针实测，引擎 htmlunit-core-js 5.3.0-legado.2 定界；不支持项锚定 `app/src/test/.../JsTest.kt#es6CompatBoundary`，支持项（含 `??=`/`&&=`/`||=`）锚定同文件 `#es6SupportedFeatures`）：

| ✅ 完全支持 | ❌ 不支持 | 替代方案 |
|---|---|---|
| `let` / `const` | `class` | function + prototype |
| 箭头函数 `=>` | `async` / `await` | 同步写法（引擎无事件循环） |
| 模板字符串 `` ` `` | 函数调用展开 `fn(...arr)` | `fn.apply(null, arr)` |
| 解构 `{a, b}` / `[a, b]` | `Promise` 链（then 回调不执行） | 同步写法；网络请求本就是同步的 |
| 默认参数 `(x = 1)` | | |
| 剩余参数 `function(...args)` | | |
| 剩余解构 `[a, ...b]` / `{a, ...r}` | | |
| 展开 `[...a]` / `{...o}` | | |
| `for...of` | | |
| `?.` 可选链 | | |
| `??` 空值合并 | | |
| `&&=` / `||=` / `??=` | | |
| `Map` / `Set` / `Symbol` | | |
| 所有 `Array.*` / `String.*` / `Object.*` ES6 方法 | | |
| `BigInt` / `globalThis` | | |

## 全局变量（上下文相关）

| 变量 | 类型 | 可用范围 |
|---|---|---|
| `java` | AnalyzeRule 或 AnalyzeUrl | 所有规则 |
| `result` | Any | 所有规则（上一步的输出） |
| `src` | String | 所有规则（原始页面源码） |
| `baseUrl` | String | 所有规则（当前页面 URL） |
| `book` | BaseBook? | 详情/目录/正文规则（AnalyzeUrl 上下文中为 Book?，RSS 中为 null） |
| `chapter` | BookChapter? | 目录/正文规则 |
| `source` | BaseSource | 所有规则 |
| `title` | String | 正文规则（当前章节标题） |
| `nextChapterUrl` | String? | 正文规则（翻页正文） |
| `cookie` | CookieStore | 所有规则 |
| `cache` | CacheManager | 所有规则 |
| `key` | String? | URL 规则（searchUrl 等）+ loginCheckJs；普通解析规则中未定义 |
| `page` | Int | 所有 AnalyzeRule 规则（默认 1）+ URL 规则 |

规则 JS 中 `java` 是 `AnalyzeRule`。`loginCheckJs` 中是 `AnalyzeUrl`，额外可访问 `java.url`（当前请求 URL）、`java.ruleUrl`（原始规则 URL）、`java.initUrl()`、`java.getStrResponse()`。
**纯JS单文件源中 `java` 是 `JsExtensions`**——本文档的 §解析辅助（getString/getElements 等）与 `java.put/get(key)` 变量存取在该上下文不存在，见 [[js-source-format.md]] §运行环境。

## 网络请求

```js
java.ajax(urlStr): String
java.ajaxAll(urlList: Array<String>): Array<StrResponse>

//返回StrResponse 方法body() code() message() headers() raw() toString() 
java.connect(urlStr): StrResponse
java.connect(urlStr, headerJson): StrResponse        // 带请求头（JSON 字符串）

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
java.htmlFormat(str);                // HTML→段落文本,保留 <img>(formatKeepImg)
java.htmlFormat(str, redirectUrl);   // 同上,并按 redirectUrl 补全相对图片地址(声明式正文管道同款)
java.strToBytes(str);                // String → ByteArray
java.bytesToStr(bytes);              // ByteArray → String
```

## 图片与字体

```js
// 验证码手动弹窗（用户肉眼输入）
java.getVerificationCode(imageUrl);

// 字体反爬
const f1 = java.queryTTF(base64FontData);          // 第二参 useCache:Boolean 可选
const f2 = java.queryTTF("https://example.com/font.ttf");
java.replaceFont(result, f1, f2, true);  // 第四参 filter=true 过滤无映射字形
```

## 存储与缓存

```js
// 每个书源（会话）
source.put(key, value);
source.get(key);

// Cookie
cookie.getCookie(url);
cookie.getKey(url, "session_id");
cookie.setCookie(url, "key=value");
cookie.removeCookie(url);

// 持久缓存（数据库，无大小上限；saveTime 单位秒，0=永不过期）
cache.put(key, value, saveTimeSeconds);
cache.get(key);
cache.delete(key);

// 文件缓存（大内容）
cache.putFile(key, value, saveTimeSeconds);
cache.getFile(key);

// 内存缓存（仅会话，LruCache 上限 50MB）
cache.putMemory(key, value);
cache.getFromMemory(key);
```

## 并发与限流（本分支新增）

多账号轮换、合并重复请求、读改写共享配额时用。键以书源为作用域。

```js
// 单飞合并：同 name 并发只有 leader 执行 action，其余等待后跳过并取 leader 结果
java.singleFlight(name, () => java.ajax(url));          // 默认超时 15000ms
java.singleFlight(name, action, 8000);

// 互斥锁：同 name 串行，每个调用都执行（用于读-改-写，如扣减配额）
java.lock(name, () => { /* 临界区 */ });

// 原子轮询计数：进程内自增，返回自增前非负序号（到 Int.MAX 回绕），多账号取模轮换
const i = java.tick("account");
const account = accounts[i % accounts.length];
```

- 等待超过 timeoutMs（默认 15000）抛异常。
- `action` 以自身 parentScope 为 this 运行：内联函数无碍；**定义在 jsLib 里的 action 取不到 book/source/java**，需 `() => fn.call(this)` 或 `fn.bind(this)` 把 this 绑到执行环境，再经 this 取用。

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
java.showBrowser(url, html?, preloadJs?, config?); // 内置浏览器供用户手动操作；config 为 JSON 字符串（如 {"expandedHeight":600}）
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

### 封面解密（coverDecodeJs）

绑定 `result`=封面原始字节流 InputStream、`src`=图片 URL、`book`；**必须返回 ByteArray**。

```js
(() => {
  const out = new java.io.ByteArrayOutputStream();
  let b; while ((b = result.read()) !== -1) out.write(b);
  return java.createSymmetricCrypto("AES/CBC/PKCS5Padding", key, iv).decrypt(out.toByteArray());
})();
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

### 回调事件（ruleContent.callBackJs，需顶层 `eventListener:true`）

绑定 `event`(事件名)、`result`、`book`、`chapter`；`java` 仅在自定义按钮事件中可用。
按钮事件返回 `true` 拦截默认动作，否则执行默认；其余事件返回值被忽略。

```js
(function() {
  // 自定义按钮事件（customButton:true 时显示按钮），java.* 可用
  if (event === "clickCustomButton") {
    java.startBrowser(`https://example.com/chapter?id=${chapter?.index}`, "章节");
    return true;   // 拦截默认动作
  }
  // 其它事件：返回值被忽略，只能改 result
  if (event === "clickShareBook") {
    result = String(result).replace(/广告/g, "");
  }
})();
```

常用 `event` 值：`clickAuthor` `clickBookName` `clickCustomButton` `longClickCustomButton`
`clickShareBook` `clickClearCache` `clickCopyBookUrl` `clickCopyTocUrl` `addBookShelf`
`delBookShelf` `saveRead` `startRead` `endRead` `startShelfRefresh` `endShelfRefresh`。

### 时间格式化

```js
java.timeFormat(timestamp);                      // 自动
java.timeFormatUTC(time, "yyyy-MM-dd", 8);       // UTC + 时区偏移
```
