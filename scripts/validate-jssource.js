#!/usr/bin/env node
// 纯JS单文件书源校验: node scripts/validate-jssource.js <source.js>
// 检查: 整文件语法 / Rhino 不兼容语法 / java.* 是否在 JsExtensions 面内 /
//       Java 包装字符串误用 / source 必填键与类型 / 必备函数存在 / 剥除键与用户态键提示
const fs = require('fs');
const vm = require('vm');
const { stripAll, rhinoIssues } = require('./rhino-checks.js');

// ── JS 源上下文的 java = JsExtensions(+JsEncodeUtils) ──
const VALID_JAVA_APIS = new Set([
  'java.ajax','java.ajaxAll','java.connect','java.get','java.head','java.post',
  'java.webView','java.webViewGetSource','java.webViewGetOverrideUrl',
  'java.startBrowser','java.startBrowserAwait','java.openUrl','java.showBrowser',
  'java.getVerificationCode','java.getCookie',
  'java.importScript','java.cacheFile','java.downloadFile',
  'java.getFile','java.readFile','java.readTxtFile','java.deleteFile',
  'java.unzipFile','java.unrarFile','java.un7zFile','java.unArchiveFile','java.getTxtInFolder',
  'java.getZipStringContent','java.getZipByteArrayContent',
  'java.getRarStringContent','java.getRarByteArrayContent',
  'java.get7zStringContent','java.get7zByteArrayContent',
  'java.strToBytes','java.bytesToStr',
  'java.base64Decode','java.base64DecodeToByteArray','java.base64Encode',
  'java.hexDecodeToByteArray','java.hexDecodeToString','java.hexEncodeToString',
  'java.md5Encode','java.md5Encode16','java.digestHex','java.digestBase64Str',
  'java.HMacHex','java.HMacBase64',
  'java.createSymmetricCrypto','java.createAsymmetricCrypto','java.createSign',
  'java.timeFormat','java.timeFormatUTC','java.encodeURI','java.htmlFormat',
  'java.t2s','java.s2t','java.toURL','java.getWebViewUA',
  'java.queryTTF','java.queryBase64TTF','java.replaceFont','java.toNumChapter',
  'java.toast','java.longToast','java.log','java.logType',
  'java.randomUUID','java.androidId','java.copyText',
  'java.singleFlight','java.lock','java.tick',
]);

// AnalyzeRule/AnalyzeUrl 专属,JS 源上下文不存在(java.get 双参 HTTP 形式仍有效,按名放行)
const RULE_ONLY_APIS = new Set([
  'java.getString','java.getStringList','java.setContent',
  'java.getElement','java.getElements',
  'java.put','java.reGetBook','java.refreshTocUrl',
  'java.initUrl','java.getStrResponse','java.url','java.ruleUrl',
]);

// ── source 配置键 ──
const REQUIRED_CONFIG = [
  ['bookSourceUrl', 'error', '主键,缺失导入即报错'],
  ['bookSourceName', 'error', '显示名,缺失导入即报错'],
  ['bookSourceType', 'warning', '0文本 1音频 2图片 3下载站,缺省 0'],
];
const VALID_CONFIG_KEYS = new Set([
  'bookSourceUrl','bookSourceName','bookSourceType','bookSourceComment','bookSourceGroup',
  'bookUrlPattern','enabledCookieJar','header','concurrentRate','jsLib',
  'loginUrl','loginUi','loginCheckJs','coverDecodeJs','eventListener','customButton',
  'variableComment','lastUpdateTime','exploreUrl',
]);
const STRIPPED_KEYS = new Set([
  'mainJs','ruleSearch','ruleExplore','ruleBookInfo','ruleToc','ruleContent','ruleReview',
]);
const INERT_KEYS = new Set([
  'enabled','enabledExplore','customOrder','weight','respondTime', // 用户态,应用维护
  'searchUrl','exploreScreen',                                     // 声明式管道,JS 源不走
]);

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('用法: node validate-jssource.js <source.js>');
    process.exit(1);
  }
  const text = fs.readFileSync(file, 'utf-8');
  const errors = [];
  const warnings = [];

  // 1. 整文件语法
  try { new vm.Script(text); } catch (e) {
    console.error(`JS语法错误: ${e.message}`);
    process.exit(1);
  }

  // 2. Rhino 不兼容语法(共享检查器,展开语法按括号上下文分类)
  const clean = stripAll(text);
  for (const { line, msg } of rhinoIssues(text)) {
    errors.push(`line ${line}: ${msg}`);
  }

  // 3. java.* API 面
  for (const call of new Set(clean.match(/\bjava\.\w+/g) || [])) {
    if (RULE_ONLY_APIS.has(call)) {
      errors.push(`${call} — AnalyzeRule/AnalyzeUrl 专属,JS 源的 java=JsExtensions;` +
        `HTML 解析用 org.jsoup.Jsoup.parse,变量用 cache 或 source.setVariable/getVariable`);
    } else if (!VALID_JAVA_APIS.has(call)) {
      errors.push(`未知 java API: ${call}`);
    }
  }

  // 4. Java 包装字符串上的 JS 专属操作(锚 JsTest.javaStringInteropBoundary):
  //    成员访问取得的字符串是包装对象,同名 Java 方法优先分派;String(...) 归一化后即原生字符串。
  //    识别面收窄到受者确定是 Java 来源的三类(实体属性/java.* 返回/Jsoup 取值);
  //    正则字面量是识别特征,用保留正则的剥离文本(stripAll 连正则一并抹掉)。
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  const keepRe = text
    .replace(/`[^`\\]*(?:\\.[^`\\]*)*`/g, blank)
    .replace(/"[^"\n\\]*(?:\\.[^"\n\\]*)*"/g, blank)
    .replace(/'[^'\n\\]*(?:\\.[^'\n\\]*)*'/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/\/\/[^\n]*/g, blank);
  const lineAt = (pos) => keepRe.slice(0, pos).split('\n').length;
  const JAVA_RECV = '(?:\\b(?:book|chapter|source)\\.\\w+|\\bjava\\.\\w+\\([^()\\n]*\\)|\\.(?:text|attr|html|outerHtml|val|absUrl)\\([^()\\n]*\\))';
  [
    ['\\s*\\.\\s*replace\\s*\\(\\s*/', errors, '正则 replace 经 Java 重载分派歧义报错'],
    ['\\s*\\.\\s*split\\s*\\(', warnings, 'split 走 Java 语义(参数按 Java 正则解释、丢尾部空串)'],
    ['\\s*\\.\\s*length\\b', warnings, 'length 是 Java 方法非属性'],
  ].forEach(([tail, list, why]) => {
    const re = new RegExp(JAVA_RECV + tail, 'g');
    let m;
    while ((m = re.exec(keepRe)) !== null) {
      list.push(`line ${lineAt(m.index)}: ${m[0].replace(/\s+/g, ' ').trim()} — ` +
        `${why},受者先 String(...) 归一化(锚 JsTest.javaStringInteropBoundary)`);
    }
  });

  // 5. 执行顶层声明,提取 source 与函数(空沙箱:顶层出现运行时调用会在此暴露)
  let probe;
  try {
    const context = vm.createContext({});
    probe = vm.runInContext(
      text + '\n;({ sourceType: typeof source,' +
        ' fns: [typeof search, typeof getBookInfo, typeof getChapters, typeof getContent, typeof explore, typeof login],' +
        ' config: typeof source === "object" ? source : null })',
      context, { timeout: 3000 });
  } catch (e) {
    errors.push(`顶层执行失败(顶层只放 source 与函数声明): ${e.message}`);
  }

  if (probe) {
    if (probe.sourceType !== 'object') {
      errors.push('缺少顶层 source 配置对象');
    } else {
      const config = probe.config;
      for (const [key, severity, msg] of REQUIRED_CONFIG) {
        if (config[key] === undefined || config[key] === '') {
          (severity === 'error' ? errors : warnings).push(`source.${key} 缺失 — ${msg}`);
        }
      }
      if (typeof config.bookSourceType === 'string') errors.push('bookSourceType 须是数字 0/1/2/3');
      if (config.header !== undefined && typeof config.header !== 'string') errors.push('header 须是 JSON 字符串');
      if (typeof config.concurrentRate === 'number') errors.push('concurrentRate 须是字符串');
      for (const k of Object.keys(config)) {
        if (STRIPPED_KEYS.has(k)) warnings.push(`source.${k} 在导入提取时被剥除,写了无效`);
        else if (INERT_KEYS.has(k)) warnings.push(`source.${k} 对 JS 源不生效(用户态或声明式管道字段)`);
        else if (!VALID_CONFIG_KEYS.has(k)) warnings.push(`source 未知键: ${k}`);
      }
    }
    const [s, gbi, gc, gct, exp, lgn] = probe.fns;
    [['search', s], ['getChapters', gc], ['getContent', gct]].forEach(([name, t]) => {
      if (t !== 'function') errors.push(`缺少必备函数 ${name}`);
    });
    if (gbi !== 'function') console.log('(getBookInfo 未定义 — 可选,详情沿用 search 阶段字段)');
    if (probe.config) {
      const eu = probe.config.exploreUrl;
      // 提取侧语义:数组=分类项列表(空数组视同未声明),字符串=名称::url 行文/JSON 文本
      const declared = Array.isArray(eu) ? eu.length > 0 : (typeof eu === 'string' && eu !== '');
      if (Array.isArray(eu)) {
        eu.forEach((item, i) => {
          if (!item || typeof item !== 'object' || typeof item.title !== 'string' || !item.title.trim()) {
            errors.push(`exploreUrl 第 ${i + 1} 项缺少非空 title — 导入时报错`);
          }
        });
      }
      if (declared && exp !== 'function') {
        errors.push('声明了 exploreUrl 须配对实现 explore(url, page) — 契约同 search');
      }
      const lu = probe.config.loginUi;
      // 提取侧语义:数组=RowUi 项列表(空数组视同未声明),字符串=JSON 文本
      const luDeclared = Array.isArray(lu) ? lu.length > 0 : (typeof lu === 'string' && lu !== '');
      if (Array.isArray(lu)) {
        lu.forEach((item, i) => {
          if (!item || typeof item !== 'object' || typeof item.name !== 'string' || !item.name.trim()) {
            errors.push(`loginUi 第 ${i + 1} 项缺少非空 name — 导入时报错`);
          }
        });
      }
      if (luDeclared && lgn !== 'function') {
        errors.push('声明了 loginUi 须配对实现 login() — 表单登录提交时调用');
      }
    }
  }

  if (errors.length) {
    console.log(`\n❌ ${errors.length} 个错误:`);
    errors.forEach(e => console.log(`  ✗ ${e}`));
  }
  if (warnings.length) {
    console.log(`\n⚠️  ${warnings.length} 个警告:`);
    warnings.forEach(w => console.log(`  ! ${w}`));
  }
  if (!errors.length && !warnings.length) console.log('✅ 全部通过');
  process.exit(errors.length ? 1 : 0);
}

main();
