# 调试与排错

**前提**：AI 通过 Playwright MCP / curl / WebFetch 验证规则；App 内行为（运行时变量、`java.log`、字体反爬、`loginCheckJs` 实际效果）只能让用户实测后反馈。

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

### 3. 离线跑选择器

把 HTML 喂给本地 Node + cheerio，验证选择器。

### 4. 让用户在 App 里实测（你无法做）

交付书源（JSON / `.js`）时同时请他们反馈结果

### 5. JS 运行时值（用户帮忙打）

需要看 App 内 JS 运行时变量时，让用户临时加：

```js
java.log("got url: " + url);
java.toast(String(result).substring(0, 100));
java.logType(variable);
```

### 6. Playwright 交叉验证加解密

站点用加解密时，直接跑函数抓中间值。优先用网页 CryptoJS（Legado 内置），其次手写，最后用 `java.createSymmetricCrypto`。

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
| `init` 后全空 | `init` 未返回 result | `return result` |
| `intro` 没段落 | 用了 `@text` | 改 `@html` |
| `coverUrl` 不显示 | 站点对图片查 Referer | URL 加选项 `{"headers":{"Referer":"..."}}` |
| `coverUrl` 不显示 | 真实 URL 在 `data-original` 等懒加载属性 | 用 `@data-original` 而非 `@src` |
| `author` 带前缀（"作者：XXX"） | 没去前缀 | `@text##作者：##` |
| `tocUrl` 写了但目录还报错 | 目录在详情页本页，不需要 `tocUrl` | 删 `tocUrl` |

### 目录

| 现象 | 可能原因 | 修复 |
|---|---|---|
| 章节缺失/只有首页 | 目录分页未配 | 加 `nextTocUrl`，Playwright 确认翻页方式 |
| 翻页是 AJAX POST | JS 加载章节 | chapterList 改 JS，nextTocUrl 用 `,{"method":"POST","body":"..."}` |
| **App 卡死** | `nextTocUrl` 末页仍命中 → 死循环 | 末页选择器必须返回空 |
| 章节顺序乱 | "最新章节"在前面 | `chapterList` 选目录区 |
| 卷+章节嵌套 | JsonPath 不支持扁平化 | JS 写 chapterList，扁平化 |
| 章节名前缀重复 | 站点格式问题 | `chapterName` 加 `##^第\d+章\s*##` |
| VIP 标识 | 没配 | `isVip: "..."` |

### 正文

| 现象 | 可能原因 | 修复 |
|---|---|---|
| 正文空 | `content` 选择器选到容器外 | 调试输出看实际 DOM，缩小选择器 |
| 正文没段落 | 用了 `@text` | 改 `@html` |
| 正文混广告 | 未清理噪声 | `replaceRegex` 加 `.*记住本站.*` 等 |
| 残留非标准标签 | 转换器漏 | `replaceRegex` 加 `</?amp-[^>]*>` |
| 翻页缺后半 | `nextContentUrl` 漏配 | 加 `nextContentUrl` |
| 翻页死循环 | 末页仍命中 | 同 `nextTocUrl` |
| 乱码 | 字体反爬 | `java.queryTTF()` + `java.replaceFont()` |
| 图片不显示 | Referer 检查 | URL 拼 `,{"headers":{"Referer":"..."}}` |
| 图片需解密 | 加密 CDN | `imageDecode` 写解密 JS |

### 纯JS单文件源

| 现象 | 原因 | 处理 |
|---|---|---|
| 报错"Java 方法 java.lang.String.replace 的选择不明确/ambiguous" | 对 Java 来源字符串（`book.*`/`chapter.*` 属性、Jsoup 取值、`java.ajax()` 返回）调了正则 `replace`，走 Java 重载分派 | 受者先 `String(...)` 归一化；机制见 [[js-source-format.md]] §运行环境 |
| `split`/`.length`/`===`/判空结果不合预期 | 同上：Java 包装字符串语义 | 同上 |
| 调试四阶段全"完成"但无字段/内容细节 | JS 源不走声明式解析器，调试只有阶段行+搜索计数 | 属正常；要看中间值在函数里 `java.log(...)` 打点 |
| 调试正常但真实搜索无结果 | 源不在搜索范围（分组未含）/被精准搜索过滤/未启用 | 让用户检查搜索范围、精准搜索开关、源启用态 |

### 反爬

| 现象 | 处理 |
|---|---|
| CF 验证页 | 按 [[references/anti-bot.md]] 配 `loginCheckJs` |
| 浏览器能开、App 不能 | cookie/session，`enabledCookieJar: true` 或 WebView |
| WebView 失败 | 后备到 `startBrowser` 手动 |
| 频繁被封 IP | `concurrentRate` 调大 |
| 验证码 | `java.getVerificationCode()` 手动输入 |

### 登录

| 现象 | 处理 |
|---|---|
| 需登录 | `loginUrl` + `loginUi` + `loginCheckJs` |
| 登录后 cookie 失效 | `loginCheckJs` 检测 → 重登 |
| 用户改密 | `loginCheckJs` 里 `source.removeLoginInfo()` |

## 性能 / 行为

| 现象 | 原因 | 修复 |
|---|---|---|
| 搜索很慢 | 全 JS searchUrl 阻塞 | 简化 JS，缓存首页响应 |
| 章节加载慢 | 单线程并发 | `concurrentRate` 减小 |
| 内容为空 | 正文真空 / 选择器错 | 检查选择器 |
| 重复书籍 | 不同 `bookUrl` 同一本 | 按 `bookUrl + bookSourceUrl` 去重 |
| 导入后书源消失 | `bookSourceUrl` 重复 | 主键冲突覆盖 |
