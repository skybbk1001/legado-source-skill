# 调试与排错

实战清单。**用法**：拿到报错或异常现象 → 在本文档对症查找 → 跳到对应规则文件修正。

# 调试与排错

**前提**：AI 通过 Playwright MCP / curl / WebFetch 验证规则；App 内行为（运行时变量、`java.log`、字体反爬、`loginCheckJs` 实际效果）只能让用户实测后反馈。

**用法**：拿到用户反馈的报错/现象 → 在本文档对症查找 → 在 AI 这侧用 Playwright/curl 复现 → 改规则。

## AI 端可用的调试手法

### 1. Playwright MCP — 主力工具

- 打开搜索/详情/目录/正文页，抓最新 DOM
- 跑站点自身 JS（确认懒加载属性、查 `data-original` 之类）
- 看 Network XHR（API 站点必看）
- 截图与用户对齐（"你看到的搜索结果是这样吗"）

### 2. curl / Bash — 拿原始响应

对比 Legado 实际会发出的请求是否被站点接受：

```bash
curl -i -A 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36' \
  'https://site/search?keyword=斗罗大陆&page=1'
```

看响应码、`Content-Type`、`Set-Cookie`、body 前几百字节。

### 3. 离线跑选择器 — 验证规则对 HTML 成立

把 curl 拿到的 HTML 喂给本地 Node + cheerio（或类似 JSoup 的库），跑 `bookList` / 字段选择器，看返回数和值。比"凭想象写选择器、丢给用户测"快得多。

### 4. 让用户在 App 里实测（你无法做）

交付 JSON 时同时请他们反馈结果

### 5. JS 运行时值（用户帮忙打）

需要看 App 内 JS 运行时变量时，让用户在规则里临时加：

```js
java.log("got url: " + url);            // 写 App 日志
java.toast(String(result).substring(0, 100));  // 弹窗显示
java.logType(variable);                 // 类型 + 值
```

用户跑一次、截图日志或弹窗给你，再删掉这些临时打印。

### 6. Playwright 交叉验证加解密

站点用了 AES/RSA/MD5 等加解密时，不在混淆 JS 里逆向着猜，直接跑函数抓中间值。

**实现优先级**：

1. **网页函数可用 → 直接用** — 网页的 CryptoJS 函数已通过浏览器验证正确，复制到 `<js>` 规则即可（Legado 内置 CryptoJS）
2. **网页函数不可用 → 写 CryptoJS** — Rhino 引擎内建 CryptoJS，与网页实现一致，避免 Java `javax.crypto` 的细微差异
3. **都不行 → 才用 `java.createSymmetricCrypto`** — Java 原生加密在编码、填充、密钥派生上可能与网页行为不同

**流程**：

1. Playwright evaluate 调用网页真实加解密函数，记录输入 → 输出
2. 用标准 Web Crypto API 复现，逐段对比 key/iv/ct，确认算法理解正确
3. 优先将网页的 CryptoJS 代码直接迁入 `<js>` 规则；只有网页函数不可提取时才手写等效逻辑

**验证模板**：

```js
// 1. 调网页函数抓参考值
browser_evaluate: () => {
  const enc = encryptText('test');           // 搜索加密
  const dec = openUrl(encUrl);               // URL 解密
  return { enc, dec, num, numStr: window.numStr };
}

// 2. 用标准 Web Crypto API 交叉验证
browser_evaluate: async () => {
  const key = new TextEncoder().encode(md5Hex);
  const ck = await crypto.subtle.importKey('raw', key, 'AES-CBC', false, ['decrypt']);
  const dec = await crypto.subtle.decrypt({name:'AES-CBC', iv}, ck, ct);
  return new TextDecoder().decode(dec);
}
```

## 按现象排查

### 搜索

| 现象 | 可能原因 | 验证 / 修复 |
|---|---|---|
| 完全无结果 | UA 拦截 | 加浏览器 UA 的 `header` |
| 完全无结果 | URL 错（编码、参数名） | `java.log` 打印 `searchUrl` 实际值，curl 复现 |
| 完全无结果 | 需 cookie/session | `enabledCookieJar: true`，必要时先访问首页 |
| 完全无结果 | 站点是 JSON API，规则按 HTML 写 | Network 看 XHR；改用 `$.` JsonPath |
| 完全无结果 | `bookList` 选错（匹配到 0 个元素） | 调试输出看 `bookList` 匹配数 |
| 只出 1 条 | `bookList` 匹配到包装容器 | `bookList` 切到单项元素（如 `ul > li` 而非 `ul`） |
| 缺字段（如作者空） | 字段在 `bookList` 元素之外的兄弟元素 | 切兄弟做 `bookList`（接受缺字段，详情页补全），或 JS bookList 拼对象（见 [[references/rule-syntax.md]] §bookList 进阶） |
| 缺字段（个别书空） | 选择器只对部分书生效 | 用 `\|\|` 回退：`primary@text\|\|fallback@text` |
| 第 2 页起为空 | 站点无 `page` 参数，或参数名不是 `page` | 看实际翻页 URL 改 `{{page}}` 位置；不分页可去掉 |
| POST 搜索后 302 跳转 | 重定向 URL 不带 cookie | `searchUrl` 用 JS（见 [[references/js-api.md]] §重定向搜索） |
| `checkKeyWord` 报错 | 关键词太冷门，站点结果库无 | 改用站点确实有的常见词（如 "斗罗大陆"） |

### 详情

| 现象 | 可能原因 | 修复 |
|---|---|---|
| 详情字段全空 | `bookUrl` 拼错（相对路径未补全） | `bookUrl` 在 `ruleSearch` 取 `@href` 即可，Legado 自动补 base |
| `init` 后所有字段空 | `init` 未返回 result | `init` 最后写 `return result` 或 `result;` |
| `intro` 没段落 | 用了 `@text` | 改 `@html` |
| `coverUrl` 不显示 | 站点对图片查 Referer | URL 加选项 `{"headers":{"Referer":"..."}}` |
| `coverUrl` 不显示 | 真实 URL 在 `data-original` 等懒加载属性 | 用 `@data-original` 而非 `@src` |
| `author` 带前缀（"作者：XXX"） | 没去前缀 | `@text##作者：##` |
| `tocUrl` 写了但目录还报错 | 目录在详情页本页，不需要 `tocUrl` | 删 `tocUrl` |

### 目录

| 现象 | 可能原因 | 修复 |
|---|---|---|
| 章节缺失/只有首页 | 目录分页但未配 | 加 `nextTocUrl`。先 Playwright 点"下一页"抓 Network 确认是 URL 参数还是 AJAX POST |
| 翻页是 AJAX POST | 站点用 JS 加载后续章节 | chapterList 改 JS：检测 JSON 响应 → `$.data[*]`；nextTocUrl 用 `,{"method":"POST","body":"..."}` 发送post请求 |
| **App 卡死** | `nextTocUrl` 末页仍命中 → 死循环 | 末页选择器必须返回空。改用 `a:contains(下一页)@href` 等"只在有下一页时存在"的选择器 |
| 章节顺序乱 | 站点把"最新章节"列在前面 | `chapterList` 选目录区，避开"最新章节"区 |
| 卷+章节嵌套（API） | JsonPath 不支持嵌套数组扁平化 | JS 写 chapterList，扁平化为单层数组 |
| 章节名前缀重复（"第 1 章 第 1 章 标题"） | 站点格式问题 | `chapterName` 加 `##^第\d+章\s*##` |
| VIP 章节标识 | 没配 | `isVip: "..."`，规则返回非空判定为 VIP |

### 正文

| 现象 | 可能原因 | 修复 |
|---|---|---|
| 正文空 | `content` 选择器选到容器外 | 调试输出看实际 DOM，缩小选择器 |
| 正文没段落 | 用了 `@text` | 改 `@html` |
| 正文混入广告/版权声明 | 未清理噪声 | `replaceRegex` 的 `|` 列表加 `.*记住本站.*` 等 |
| 正文残留 `<amp-img>` / `<mip-*>` 标签 | 非标准 HTML，转换器漏 | `replaceRegex` 的 `|` 列表加 `</?amp-[^>]*>` |
| 翻页章节缺后半 | `nextContentUrl` 漏配 | 加 `nextContentUrl` |
| 翻页死循环 | 末页 `nextContentUrl` 仍命中 | 同 `nextTocUrl` 处理 |
| 乱码方块字 | 字体反爬 | `java.queryTTF()` + `java.replaceFont()`，见 [[references/js-api.md]] §字体反爬 |
| 图片不显示 | Referer 检查 | 图片 URL 拼 `,{"headers":{"Referer":"..."}}` |
| 图片需解密 | 加密 CDN | `imageDecode` 写解密 JS，见 [[references/js-api.md]] §AES/XOR 图片解密 |

### 反爬

| 现象 | 处理 |
|---|---|
| 响应是 CF 验证页（含 `_cf_chl_opt`、`Just a moment`） | 按 [[references/anti-bot.md]] 配 `loginCheckJs` 完整模板 |
| 浏览器能开、App 不能 | cookie/session 问题，`enabledCookieJar: true` 或转 WebView |
| WebView 自动验证失败 | 后备到 `startBrowser` 手动 |
| 频繁被封 IP | `concurrentRate` 调大（如 `"500"` 改 `"2000"`，或 `"3/1000"` 改 `"1/3000"`） |
| 验证码 | `java.ocr()`（仅字母数字）或 `java.getVerificationCode()` 弹窗 |

### 登录

| 现象 | 处理 |
|---|---|
| 需先登录才能搜 | `loginUrl` + `loginUi`（表单）+ `loginCheckJs` |
| 登录后 cookie 失效 | `loginCheckJs` 检测 → 重登 |
| 用户改密后旧 cookie 失效 | `loginCheckJs` 里 `source.removeLoginInfo()` 触发重登 |

## 性能 / 行为

| 现象 | 原因 | 修复 |
|---|---|---|
| 搜索很慢 | 全 JS searchUrl 阻塞 | 简化 JS，缓存首页响应 |
| 章节加载慢 | 单线程并发 | `concurrentRate` 减小（如 `"500"`） |
| 提示"内容为空" | 正文真空 / 选择器错 | 看 `BookContent.kt` 抛 `ContentEmptyException` 的逻辑——`isVolume` 章节允许空 |
| 重复书籍 | 不同 `bookUrl` 同一本 | Legado 按 `bookUrl + bookSourceUrl` 去重，自身控制不了；接受 |
| 备份导入后书源消失 | `bookSourceUrl` 重复 | 主键冲突会覆盖，检查 URL |
