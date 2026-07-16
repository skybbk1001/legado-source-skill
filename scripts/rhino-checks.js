// Rhino 不兼容语法检查(两个校验器共用)。
// 边界锚定 app/src/test/.../JsTest.kt:不支持面 #es6CompatBoundary,支持面 #es6SupportedFeatures。
// `...` 按括号上下文分类:字面量展开 [.../{... 与函数剩余参数 f(...args){ 支持,
// 调用处展开 f(...arr) 与数组剩余解构 [a,...b]= 不支持——正则区分不了参数位/调用位,须结构分类。
const REGEX_CHECKS = [
  { pattern: /\basync\s+(function|\(|\w+\s*\()/, msg: 'async/await — Rhino不支持,java.ajax 等本就是同步' },
  { pattern: /\bawait\s+/, msg: 'await — Rhino不支持' },
  { pattern: /\.then\s*\(/, msg: 'Promise回调 — 引擎无事件循环,回调不执行' },
  { pattern: /\bclass\s+[A-Za-z_$]/, msg: 'ES6 class — Rhino不支持,用 function+prototype' },
];

// 剥离注释/字符串/正则字面量,逐字符替换但保留换行 → 剥离后行号与原文一致
function stripAll(code) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  return code
    .replace(/`[^`\\]*(?:\\.[^`\\]*)*`/g, blank)
    .replace(/"[^"\n\\]*(?:\\.[^"\n\\]*)*"/g, blank)
    .replace(/'[^'\n\\]*(?:\\.[^'\n\\]*)*'/g, blank)
    .replace(/\/[^\/\n\\*][^\/\n\\]*(?:\\.[^\/\n\\]*)*\/[gimsuy]*/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/\/\/[^\n]*/g, blank);
}

function lineOf(text, pos) {
  return text.slice(0, pos).split('\n').length;
}

// 从 pos 向前找包住它的最近开括号
function enclosingOpen(code, pos) {
  const depth = { ')': 0, ']': 0, '}': 0 };
  const closerOf = { '(': ')', '[': ']', '{': '}' };
  for (let i = pos - 1; i >= 0; i--) {
    const ch = code[i];
    if (depth[ch] !== undefined) depth[ch]++;
    else if (closerOf[ch]) {
      if (depth[closerOf[ch]] > 0) depth[closerOf[ch]]--;
      else return { ch, pos: i };
    }
  }
  return null;
}

// 从开括号向后找配对闭括号(同型计数;字符串/注释已剥离)
function matchClose(code, openPos) {
  const open = code[openPos];
  const close = { '(': ')', '[': ']', '{': '}' }[open];
  let depth = 0;
  for (let i = openPos; i < code.length; i++) {
    if (code[i] === open) depth++;
    else if (code[i] === close && --depth === 0) return i;
  }
  return -1;
}

function nextNonSpace(code, from) {
  for (let i = from; i < code.length; i++) {
    if (!/\s/.test(code[i])) return i;
  }
  return -1;
}

function spreadIssues(clean) {
  const issues = [];
  for (let i = 0; i + 2 < clean.length; i++) {
    if (clean[i] !== '.' || clean.slice(i, i + 3) !== '...') continue;
    const open = enclosingOpen(clean, i);
    if (open && open.ch === '(') {
      const close = matchClose(clean, open.pos);
      const after = close >= 0 ? nextNonSpace(clean, close + 1) : -1;
      const isParamList = after >= 0 &&
        (clean[after] === '{' || clean.slice(after, after + 2) === '=>');
      if (!isParamList) {
        issues.push({ line: lineOf(clean, i), msg: '函数调用展开 f(...arr) — Rhino不支持,用 fn.apply(null, arr)' });
      }
    } else if (open && open.ch === '[') {
      const close = matchClose(clean, open.pos);
      const after = close >= 0 ? nextNonSpace(clean, close + 1) : -1;
      if (after >= 0 && clean[after] === '=' && clean[after + 1] !== '=') {
        issues.push({ line: lineOf(clean, i), msg: '数组剩余解构 [a, ...b] — Rhino不支持,用 arr.slice(1)' });
      }
    }
    // 对象展开 {...o} 与数组字面量展开 [...a]、剩余参数 f(...args) 均支持
    i += 2;
  }
  return issues;
}

/** @returns {{line: number, msg: string}[]} code 原文中的 Rhino 不兼容语法 */
function rhinoIssues(code) {
  const clean = stripAll(code);
  const issues = [];
  for (const { pattern, msg } of REGEX_CHECKS) {
    const m = pattern.exec(clean);
    if (m) issues.push({ line: lineOf(clean, m.index), msg });
  }
  return issues.concat(spreadIssues(clean));
}

module.exports = { stripAll, rhinoIssues };
