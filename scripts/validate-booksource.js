#!/usr/bin/env node
const fs = require('fs');
const vm = require('vm');
const { rhinoIssues } = require('./rhino-checks.js');

// ── 合法字段名 ──
const VALID_TOP = new Set([
  'bookSourceUrl','bookSourceName','bookSourceType','bookSourceComment','bookSourceGroup',
  'bookUrlPattern','enabled','enabledExplore','enabledCookieJar',
  'header','concurrentRate','jsLib','loginUrl','loginUi','loginCheckJs',
  'coverDecodeJs','eventListener','customButton','customOrder','variableComment','exploreScreen',
  'searchUrl','weight','respondTime','lastUpdateTime',
  'ruleSearch','ruleBookInfo','ruleToc','ruleContent','ruleReview','ruleExplore','exploreUrl',
]);

const VALID_RULES = {
  ruleSearch: new Set([
    'checkKeyWord','bookList','name','author','bookUrl','coverUrl',
    'kind','lastChapter','updateTime','wordCount','intro',
  ]),
  ruleBookInfo: new Set([
    'init','name','author','intro','coverUrl','kind','lastChapter',
    'tocUrl','wordCount','updateTime','canReName','downloadUrls',
  ]),
  ruleToc: new Set([
    'chapterList','chapterName','chapterUrl','nextTocUrl',
    'isVip','isPay','isVolume','preUpdateJs','formatJs','updateTime',
  ]),
  ruleContent: new Set([
    'content','nextContentUrl','replaceRegex','webJs','sourceRegex',
    'imageDecode','payAction','imageStyle','callBackJs','title',
  ]),
  ruleExplore: new Set([
    'bookList','name','author','bookUrl','coverUrl','kind',
    'lastChapter','updateTime','wordCount','intro',
  ]),
};

// ── 必填字段（path, severity, message）──
const REQUIRED_FIELDS = [
  ['bookSourceUrl', 'error', '主键，缺失会导致无法导入或与其他源冲突'],
  ['bookSourceName', 'error', '书源显示名'],
  ['bookSourceType', 'error', '必须指定：0=文本 1=音频 2=图片 3=文件'],
  ['searchUrl', 'warning', '搜索地址（explore-only源可为空）'],
  ['ruleSearch', 'error', '搜索规则'],
  ['ruleSearch.bookList', 'warning', '搜索结果列表容器'],
  ['ruleSearch.name', 'warning', '书名字段'],
  ['ruleSearch.author', 'warning', '作者字段'],
  ['ruleSearch.bookUrl', 'warning', '详情页链接'],
  ['ruleBookInfo', 'warning', '详情规则'],
  ['ruleToc', 'error', '目录规则'],
  ['ruleToc.chapterList', 'error', '章节列表容器'],
  ['ruleToc.chapterName', 'error', '章节名'],
  ['ruleToc.chapterUrl', 'error', '章节链接'],
  ['ruleContent', 'error', '正文规则'],
  ['ruleContent.content', 'error', '正文内容选择器'],
];

// ── Legado java.* API ──
const VALID_JAVA_APIS = new Set([
  'java.ajax','java.ajaxAll','java.connect',
  'java.get','java.head','java.post',
  'java.url','java.ruleUrl',
  'java.webView','java.webViewGetOverrideUrl','java.webViewGetSource',
  'java.md5Encode','java.md5Encode16',
  'java.digestHex','java.digestBase64Str',
  'java.HMacHex','java.HMacBase64',
  'java.base64Decode','java.base64DecodeToByteArray','java.base64Encode',
  'java.hexDecodeToByteArray','java.hexDecodeToString','java.hexEncodeToString',
  'java.createSymmetricCrypto','java.createAsymmetricCrypto','java.createSign',
  'java.getString','java.getStringList','java.setContent',
  'java.getElement','java.getElements',
  'java.encodeURI','java.t2s','java.s2t','java.htmlFormat',
  'java.toURL',
  'java.strToBytes','java.bytesToStr',
  'java.getVerificationCode',
  'java.queryTTF','java.replaceFont',
  'java.put','java.get',
  'java.downloadFile','java.readTxtFile','java.deleteFile','java.getFile','java.readFile',
  'java.cacheFile','java.importScript',
  'java.unzipFile','java.unrarFile','java.un7zFile','java.unArchiveFile',
  'java.getTxtInFolder',
  'java.getZipStringContent','java.getZipByteArrayContent',
  'java.getRarStringContent','java.getRarByteArrayContent',
  'java.get7zStringContent','java.get7zByteArrayContent',
  'java.toast','java.longToast','java.log','java.logType',
  'java.startBrowser','java.startBrowserAwait','java.openUrl',
  'java.showBrowser',
  'java.copyText','java.randomUUID','java.androidId',
  'java.toNumChapter','java.getWebViewUA',
  'java.timeFormat','java.timeFormatUTC',
  'java.refreshTocUrl','java.reGetBook',
  'java.initUrl','java.getStrResponse',
  'java.singleFlight','java.lock','java.tick','java.getCookie',
]);

// ── 浏览器API（仅webView/webJs上下文可用）──
const BROWSER_GLOBALS = [
  'document','window','navigator','location','history',
  'localStorage','sessionStorage','screen','parent','top','self',
  'fetch','XMLHttpRequest','WebSocket','EventSource',
  'addEventListener','removeEventListener','dispatchEvent',
  'getElementById','getElementsByClassName','getElementsByTagName',
  'querySelector','querySelectorAll',
  'alert','confirm','prompt',
  'setTimeout','setInterval','clearTimeout','clearInterval',
  'requestAnimationFrame','cancelAnimationFrame',
  'console',
  'innerHTML','outerHTML','innerText','textContent',
  'classList','className','parentNode','childNodes',
  'firstChild','lastChild','nextSibling','previousSibling',
  'nextElementSibling','previousElementSibling',
  'dataset','getAttribute','setAttribute',
  'createElement','createTextNode','appendChild','removeChild',
  'Blob','File','FileReader','FormData','URL','URLSearchParams',
  'atob','btoa','Image',
];

// ── 工具函数 ──
function stripComments(code) {
  return code.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function stripStrings(code) {
  return code
    .replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, '""')
    .replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, "''")
    .replace(/`[^`\\]*(?:\\.[^`\\]*)*`/g, '``');
}

function stripRegex(code) {
  // 去掉正则字面量 /.../flags，避免里面的{ } [ ] ( ) // 被误计
  // MUST run BEFORE stripComments because \// inside a regex can look like //
  return code.replace(/\/[^\/\n\\]*(?:\\.[^\/\n\\]*)*\/[gimsuy]*/g, '""');
}

function stripAll(code) { return stripComments(stripRegex(stripStrings(code))); }

function lineAt(code, pos) {
  const lineNum = code.slice(0, pos).split('\n').length;
  const lineStart = code.lastIndexOf('\n', pos) + 1;
  let lineEnd = code.indexOf('\n', pos);
  if (lineEnd === -1) lineEnd = code.length;
  return { lineNum, line: code.slice(lineStart, lineEnd).trim().slice(0, 100) };
}

// ── 提取JS块 ──
function extractJsBlocks(obj, path = '') {
  const blocks = [];
  const jsFields = new Set([
    'init','loginCheckJs','loginUrl','preUpdateJs','formatJs','webJs',
    'imageDecode','payAction','callBackJs','jsLib','coverDecodeJs',
  ]);

  if (typeof obj === 'string') {
    if (obj.startsWith('@js:')) {
      blocks.push({ path: `${path}[@js:]`, code: obj.slice(4) });
    }
    const jsMatches = obj.match(/<js>([\s\S]*?)<\/js>/g);
    if (jsMatches) {
      jsMatches.forEach((m, i) => {
        const inner = m.replace(/<\/?js>/g, '');
        blocks.push({ path: `${path}[<js>#${i}]`, code: inner });
      });
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => blocks.push(...extractJsBlocks(v, `${path}[${i}]`)));
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const childPath = path ? `${path}.${k}` : k;
      if (jsFields.has(k) && typeof v === 'string' && v.trim()) {
        blocks.push({ path: childPath, code: v });
      } else {
        blocks.push(...extractJsBlocks(v, childPath));
      }
    }
  }
  return blocks;
}

// ── 检查器 ──
// Rhino 不兼容语法走共享检查器(rhino-checks.js):async/await/Promise回调/class,
// 展开语法按括号上下文分类(剩余参数/字面量展开支持,调用展开/剩余解构不支持)
function checkRhinoIssues(code) {
  return rhinoIssues(code).map(({ line, msg }) => ({
    severity: 'error', msg: `${msg}\n    → line ${line}`,
  }));
}

function checkJavaApis(code) {
  const unknown = [];
  const calls = new Set(code.match(/\bjava\.\w+/g) || []);
  for (const call of calls) {
    if (!VALID_JAVA_APIS.has(call)) unknown.push(`未知java API: ${call}`);
  }
  return unknown;
}

function checkBraceBalance(code) {
  code = stripAll(code);
  const stack = [];
  const pairs = { '{': '}', '[': ']', '(': ')' };
  const closing = { '}': '{', ']': '[', ')': '(' };
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (pairs[ch]) { stack.push({ ch, pos: i }); }
    else if (closing[ch]) {
      if (!stack || stack[stack.length - 1].ch !== closing[ch]) {
        const { lineNum } = lineAt(code, i);
        return [`括号不匹配 '${ch}' at line ${lineNum}`];
      }
      stack.pop();
    }
  }
  if (stack.length) {
    return [`未闭合: ${stack.map(s => `'${s.ch}' at col ${s.pos}`).join(', ')}`];
  }
  return [];
}

function checkBrowserApis(code, snippetPath) {
  if (/webJs|webView|exploreUrl/.test(snippetPath)) return [];
  const noStrings = stripStrings(code);
  const issues = [];
  for (const api of BROWSER_GLOBALS) {
    if (new RegExp('\\b' + api.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(noStrings)) {
      issues.push(`浏览器API '${api}' — 仅在java.webView()参数或webJs中可用，其他位置会ReferenceError`);
    }
  }
  return issues;
}

// ── replaceRegex 验证 ──
// 格式: ## 切片: ['', regex] | ['', regex, replacement] | 末段='#'=仅替换首个
// >4 段 或 末段非 #/空 → 格式错误
function validateReplaceRegex(rr, path) {
  const issues = [];
  if (!rr || typeof rr !== 'string' || !rr.trim()) return issues;

  const parts = rr.split('##');
  const firstOnly = parts[parts.length - 1] === '#';
  const body = firstOnly ? parts.slice(0, -1) : parts;

  if (body.length < 2 || body.length > 3) {
    issues.push({ severity: 'error', msg: `${path} 格式错误 (${parts.length}段) — 应为 ##regex 或 ##regex##replacement 或末尾 +###` });
    return issues;
  }
  const regexStr = body[1];
  if (!regexStr) {
    issues.push({ severity: 'error', msg: `${path} 正则为空` });
    return issues;
  }
  return validateRegexStr(regexStr, path);
}

function validateRegexStr(regexStr, path) {
  const issues = [];
  try { new RegExp(regexStr); } catch (e) {
    issues.push({ severity: 'warning', msg: `${path} 正则编译失败(Java/JS可能有差异): ${e.message}\n    正则: ${regexStr}` });
  }
  if (/\.\*|\.\+/.test(regexStr) && !/\[\\[sS]\]/.test(regexStr)) {
    issues.push({ severity: 'warning', msg: `${path} .* 或 .+ — Java 中 . 不匹配换行符，跨行请用 [\\s\\S]` });
  }
  return issues;
}

// 遍历书源收集所有 replaceRegex 字段
function collectReplaceRegex(obj, path) {
  const results = [];
  if (!obj || typeof obj !== 'object') return results;
  for (const [k, v] of Object.entries(obj)) {
    const childPath = path ? `${path}.${k}` : k;
    if (k === 'replaceRegex' && typeof v === 'string') results.push({ path: childPath, value: v });
    else if (v && typeof v === 'object') results.push(...collectReplaceRegex(v, childPath));
  }
  return results;
}

// ── 主逻辑 ──
function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('用法: node validate-booksource.js <书源.json>');
    process.exit(1);
  }

  let src;
  try {
    src = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    console.error(`JSON解析失败: ${e.message}`);
    process.exit(1);
  }

  const errors = [];
  const warnings = [];

  // 1. 必填字段
  for (const [path, severity, msg] of REQUIRED_FIELDS) {
    const parts = path.split('.');
    let obj = src, found = true;
    for (const key of parts) {
      if (obj && typeof obj === 'object' && key in obj && obj[key] !== '') {
        obj = obj[key];
      } else { found = false; break; }
    }
    if (!found) {
      const entry = `缺少 ${path} — ${msg}`;
      (severity === 'error' ? errors : warnings).push(entry);
    }
  }
  if (typeof src.searchUrl === 'string' && !src.searchUrl.trim()) {
    errors.push('searchUrl 为空字符串');
  }

  // 2. 字段名检查
  for (const k of Object.keys(src)) {
    if (!VALID_TOP.has(k)) warnings.push(`未知顶层字段: ${k}`);
  }
  for (const [rule, validSet] of Object.entries(VALID_RULES)) {
    if (src[rule]) {
      for (const k of Object.keys(src[rule])) {
        if (!validSet.has(k)) warnings.push(`${rule} 未知字段: ${k}`);
      }
    }
  }

  // 2.5 类型检查
  if (typeof src.concurrentRate === 'number') errors.push('concurrentRate 必须是字符串 "1000"，不能是数字');
  if (typeof src.bookSourceType === 'string') errors.push('bookSourceType 必须是数字 0/1/2/3，不能是字符串');
  if (src.header !== undefined && src.header !== null && typeof src.header !== 'string') errors.push('header 必须是 JSON 字符串，不能直接写对象');
  if (typeof src.bookUrlPattern === 'string' && src.bookUrlPattern.trim()) {
    try { new RegExp(src.bookUrlPattern); } catch (e) { errors.push(`bookUrlPattern 正则无效: ${e.message}`); }
  }
  if (src.ruleContent && typeof src.ruleContent.sourceRegex === 'string' && src.ruleContent.sourceRegex.trim()) {
    try { new RegExp(src.ruleContent.sourceRegex); } catch (e) { errors.push(`ruleContent.sourceRegex 正则无效: ${e.message}`); }
  }

  // 3. replaceRegex 语法验证
  const rrFields = collectReplaceRegex(src);
  if (rrFields.length) {
    console.log(`\n发现 ${rrFields.length} 个 replaceRegex 规则:`);
    for (const { path, value } of rrFields) {
      const preview = value.length > 80 ? value.slice(0, 80) + '…' : value;
      console.log(`  [${path}] ${preview}`);
    }
    for (const { path, value } of rrFields) {
      for (const { severity, msg } of validateReplaceRegex(value, `[${path}]`)) {
        (severity === 'error' ? errors : warnings).push(msg);
      }
    }
  }

  // 4. JS分析
  const jsBlocks = extractJsBlocks(src);
  if (jsBlocks.length) {
    console.log(`发现 ${jsBlocks.length} 个JS代码块:`);
    for (const { path, code } of jsBlocks) {
      const preview = code.replace(/\n/g, '\\n').slice(0, 90);
      console.log(`  [${path}] ${preview}${code.length > 90 ? '…' : ''}`);
    }
  } else {
    console.log('(书源中未发现JS代码)');
  }

  for (const { path, code } of jsBlocks) {
    // 基础语法检查（vm.Script 与 Legado 一致，代码原样编译不包裹函数）
    try { new vm.Script(code); } catch (e) {
      errors.push(`[${path}] JS语法错误: ${e.message}`);
    }
    for (const { severity, msg } of checkRhinoIssues(code)) {
      (severity === 'error' ? errors : warnings).push(`[${path}] ${msg}`);
    }
    for (const msg of checkJavaApis(code)) {
      errors.push(`[${path}] ${msg}`);
    }
    for (const msg of checkBraceBalance(code)) {
      errors.push(`[${path}] ${msg}`);
    }
    for (const msg of checkBrowserApis(code, path)) {
      errors.push(`[${path}] ${msg}`);
    }
  }

  // 输出报告
  if (errors.length) {
    console.log(`\n❌ ${errors.length} 个错误:`);
    errors.forEach(e => console.log(`  ✗ ${e}`));
  }
  if (warnings.length) {
    console.log(`\n⚠️  ${warnings.length} 个警告:`);
    warnings.forEach(w => console.log(`  ! ${w}`));
  }
  if (!errors.length && !warnings.length) {
    console.log('\n✅ 全部通过');
  }

  console.log(`\n─── ${jsBlocks.length} 个JS块, ${errors.length} 错误, ${warnings.length} 警告 ───`);
  process.exit(errors.length ? 1 : 0);
}

main();
