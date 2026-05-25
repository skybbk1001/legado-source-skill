#!/usr/bin/env python3
"""Validate a Legado book source JSON for correctness.

Runs two independent checks:

A. Structure — required fields present (bookSourceUrl, searchUrl, ruleSearch.*,
   ruleToc.*, ruleContent.*, etc.)

B. JavaScript — every JS snippet in the source is checked for:
   1. Rhino-incompatible syntax (async/await, class, spread in calls)
   2. return outside function body — Rhino rejects this at parse time
   3. Browser APIs used outside java.webView() / webJs context
   4. java.* API calls against known available APIs
   5. Bracket/brace balance

Usage: python validate-booksource.py <booksource.json>
       cat booksource.json | python validate-booksource.py -
"""

import json
import re
import sys


# ── Known java.* APIs in Legado Rhino engine ──────────────────────────

VALID_JAVA_APIS = {
    # Network
    "java.ajax", "java.ajaxAll", "java.connect",
    "java.get", "java.head", "java.post",
    # Properties (not methods, but accessed as java.xxx)
    "java.url", "java.ruleUrl",
    # WebView
    "java.webView", "java.webViewGetOverrideUrl", "java.webViewGetSource",
    # Hash / Encode
    "java.md5Encode", "java.md5Encode16",
    "java.digestHex", "java.digestBase64Str",
    "java.HMacHex", "java.HMacBase64",
    "java.base64Decode", "java.base64DecodeToByteArray", "java.base64Encode",
    "java.hexDecodeToByteArray", "java.hexDecodeToString", "java.hexEncodeToString",
    # Crypto
    "java.createSymmetricCrypto", "java.createAsymmetricCrypto", "java.createSign",
    # Rule helpers
    "java.getString", "java.getStringList", "java.setContent",
    "java.getElement", "java.getElements",
    # Text
    "java.encodeURI", "java.t2s", "java.s2t", "java.htmlFormat",
    "java.strToBytes", "java.bytesToStr",
    # OCR / Font
    "java.ocr", "java.getVerificationCode",
    "java.queryTTF", "java.replaceFont",
    # Storage
    "java.put", "java.get",
    # File
    "java.downloadFile", "java.readTxtFile", "java.deleteFile",
    "java.cacheFile", "java.importScript",
    "java.unzipFile", "java.unrarFile", "java.un7zFile", "java.unArchiveFile",
    "java.getTxtInFolder",
    "java.getZipStringContent", "java.getZipByteArrayContent",
    "java.getRarStringContent", "java.getRarByteArrayContent",
    "java.get7zStringContent", "java.get7zByteArrayContent",
    # UI
    "java.toast", "java.longToast", "java.log", "java.logType",
    "java.startBrowser", "java.startBrowserAwait", "java.openUrl",
    "java.copyText", "java.randomUUID", "java.androidId",
    "java.toNumChapter", "java.getWebViewUA",
    # Time
    "java.timeFormat", "java.timeFormatUTC",
    # Toc-specific
    "java.refreshTocUrl", "java.reGetBook",
    # Local variables
    "java.setLocal",
    # loginCheckJs only
    "java.initUrl", "java.getStrResponse",
}

# ── Browser APIs — only valid inside java.webView() JS param ──────────

# These globals only exist in a WebView JS context (java.webView 参数).
# In rule JS / loginCheckJs / init / etc. they are undefined and will
# throw ReferenceError at runtime.
BROWSER_GLOBALS = [
    "document", "window", "navigator", "location", "history",
    "localStorage", "sessionStorage", "screen", "parent", "top", "self",
    "fetch", "XMLHttpRequest", "WebSocket", "EventSource",
    "addEventListener", "removeEventListener", "dispatchEvent",
    "getElementById", "getElementsByClassName", "getElementsByTagName",
    "querySelector", "querySelectorAll",
    "alert", "confirm", "prompt",
    "setTimeout", "setInterval", "clearTimeout", "clearInterval",
    "requestAnimationFrame", "cancelAnimationFrame",
    "console",
    "innerHTML", "outerHTML", "innerText", "textContent",
    "classList", "className", "parentNode", "childNodes",
    "firstChild", "lastChild", "nextSibling", "previousSibling",
    "nextElementSibling", "previousElementSibling",
    "style", "dataset", "getAttribute", "setAttribute",
    "createElement", "createTextNode", "appendChild", "removeChild",
    "Blob", "File", "FileReader", "FormData", "URL", "URLSearchParams",
    "atob", "btoa", "Image",
]

# ── Rhino-incompatible syntax ─────────────────────────────────────────

RHINO_CHECKS = [
    (
        re.compile(r'\basync\s+(function|\(|\w+\s*\()'),
        "error",
        "async/await — Rhino does not support async functions; use Promise chains"
    ),
    (
        re.compile(r'\bawait\s+'),
        "error",
        "await — Rhino does not support await; use .then() chains"
    ),
    (
        re.compile(r'\bclass\s+[A-Za-z_$]'),
        "error",
        "ES6 class — Rhino does not support class; use function + prototype"
    ),
    (
        re.compile(r'\.\.\.\s*(arr|args|[a-zA-Z_$]\w*)\s*\)'),
        "error",
        "function call spread (...args) — use fn.apply(null, arr)"
    ),
    (
        re.compile(r'for\s*\(\s*(let|const|var)\s+\w+\s+of\s+'),
        "warning",
        "for...of on Java List may fail — use list.size() + list.get(i)"
    ),
]


# ── Helpers ───────────────────────────────────────────────────────────

def strip_comments(code):
    """Remove JS comments (// and /* */)."""
    code = re.sub(r'//[^\n]*', '', code)
    code = re.sub(r'/\*.*?\*/', '', code, flags=re.DOTALL)
    return code


def strip_strings(code):
    """Replace string literals with empty strings to avoid false matches."""
    code = re.sub(r'"[^"\\]*(?:\\.[^"\\]*)*"', '""', code)
    code = re.sub(r"'[^'\\]*(?:\\.[^'\\]*)*'", "''", code)
    code = re.sub(r'`[^`\\]*(?:\\.[^`\\]*)*`', '``', code)
    return code


def strip_all(code):
    """Strip comments then strings for clean pattern matching."""
    return strip_strings(strip_comments(code))


def line_at(code, pos):
    """Return the line number and content at position `pos`."""
    line_num = code[:pos].count('\n') + 1
    line_start = code.rfind('\n', 0, pos) + 1
    line_end = code.find('\n', pos)
    if line_end == -1:
        line_end = len(code)
    return line_num, code[line_start:line_end].strip()[:100]


# ── Extract JS from book source JSON ──────────────────────────────────

def extract_js_from_json(obj, path=""):
    """Recursively find all JS code in a book source JSON."""
    snippets = []

    if isinstance(obj, dict):
        js_string_fields = {
            "init", "loginCheckJs", "loginUrl",
            "preUpdateJs", "formatJs", "webJs",
            "imageDecode", "payAction", "callBackJs",
            "jsLib", "coverDecodeJs",
        }
        for key, value in obj.items():
            child_path = f"{path}.{key}" if path else key
            if key in js_string_fields and isinstance(value, str) and value.strip():
                snippets.append((child_path, value))
            elif isinstance(value, (dict, list)):
                snippets.extend(extract_js_from_json(value, child_path))

        for key, value in obj.items():
            child_path = f"{path}.{key}" if path else key
            if isinstance(value, str):
                if value.startswith("@js:"):
                    snippets.append((f"{child_path}[@js:]", value[4:]))
                for i, match in enumerate(re.finditer(r'<js>(.*?)</js>', value, re.DOTALL)):
                    snippets.append((f"{child_path}[<js>#{i}]", match.group(1)))
                if key == "searchUrl" and not value.startswith("http"):
                    if re.search(r'\b(function|return|java\.)', value):
                        snippets.append((f"{child_path}[searchUrl]", value))

    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            snippets.extend(extract_js_from_json(item, f"{path}[{i}]"))

    return snippets


# ── Checkers ──────────────────────────────────────────────────────────

def check_rhino_issues(code):
    """Return list of (severity, message) for Rhino incompatibilities."""
    issues = []
    for pattern, severity, msg in RHINO_CHECKS:
        m = pattern.search(code)
        if m:
            ln, line = line_at(code, m.start())
            issues.append((severity, f"{msg}\n    → line {ln}: {line}"))
    return issues


def check_java_apis(code):
    """Return list of unknown java.* calls."""
    unknown = []
    calls = set(re.findall(r'\b(java\.\w+)', code))
    for call in calls:
        if call not in VALID_JAVA_APIS:
            unknown.append(f"Unknown java API: {call}")
    return unknown


def check_brace_balance(code):
    """Check bracket/brace/paren balance."""
    stack = []
    pairs = {'{': '}', '[': ']', '(': ')'}
    closing = {'}': '{', ']': '[', ')': '('}
    for i, ch in enumerate(code):
        if ch in pairs:
            stack.append((ch, i))
        elif ch in closing:
            if not stack or stack[-1][0] != closing[ch]:
                ln, _ = line_at(code, i)
                return [f"Unbalanced {ch} at line {ln}, col {i - code.rfind(chr(10), 0, i)}"]
            stack.pop()
    if stack:
        positions = [f"'{ch}' at col {pos}" for ch, pos in stack]
        return [f"Unclosed: {', '.join(positions)}"]
    return []


def check_bare_return(code):
    """Detect return at top level (not inside any function body).

    The approach: strip strings, then walk the code tracking two depths:
      - brace_depth:  { } nesting
      - func_depth:   counts function/arrow boundaries

    A `return` is "bare" (invalid) when func_depth == 0.
    """
    cleaned = strip_strings(strip_comments(code))

    func_depth = 0
    brace_depth = 0
    issues = []
    i = 0
    n = len(cleaned)

    while i < n:
        ch = cleaned[i]

        # ── function keyword ──
        if cleaned[i:i+8] == 'function' and (
            i + 8 >= n or not cleaned[i+8].isalnum()
        ):
            func_depth += 1
            i += 8
            continue

        # ── arrow => ──
        if cleaned[i:i+2] == '=>':
            func_depth += 1
            i += 2
            continue

        # ── return keyword ──
        if cleaned[i:i+6] == 'return':
            after = cleaned[i+6] if i + 6 < n else ' '
            before = cleaned[i-1] if i > 0 else ' '
            if not before.isalnum() and not after.isalnum():
                if func_depth == 0:
                    ln, line = line_at(code, i)
                    issues.append(
                        f"return at top level (line {ln}) — wrap in IIFE:\n"
                        f"    → (() => {{ ... return x; }})()"
                    )
            i += 6
            continue

        # ── brace tracking ──
        if ch == '{':
            brace_depth += 1
        elif ch == '}':
            brace_depth -= 1
            # When brace_depth drops below the function-entry depth,
            # we've exited one or more function bodies.
            if func_depth > brace_depth:
                func_depth = brace_depth

        i += 1

    return issues


def check_browser_apis(code, snippet_path):
    """Detect browser APIs used outside java.webView() / webJs context.

    Browser globals (document, window, fetch, etc.) only exist inside the JS
    string passed to java.webView() or in the webJs field.  In rule JS they
    are undefined and will throw ReferenceError.

    We strip string literals first: if a browser API name appears inside a
    string (e.g. "document.querySelector('...')"), it is a webView parameter
    and is therefore valid.  If it appears as a bare identifier, it's an error.
    """
    # webJs field runs in WebView context — browser APIs are fine
    if 'webJs' in snippet_path or 'webView' in snippet_path:
        return []

    # Remove string literals — browser APIs inside strings = webView params
    no_strings = strip_strings(code)

    issues = []
    for api in BROWSER_GLOBALS:
        pattern = re.compile(r'\b' + re.escape(api) + r'\b')
        if pattern.search(no_strings):
            issues.append(
                f"Browser API '{api}' — only valid inside java.webView() JS "
                f"parameter or webJs field, will throw ReferenceError elsewhere"
            )

    return issues


# ── Required field checks ─────────────────────────────────────────────

# (path, severity, message-if-missing)
REQUIRED_FIELDS = [
    # Top-level
    ("bookSourceUrl", "error", "主键，缺失会导致无法导入或与其他源冲突"),
    ("bookSourceName", "error", "书源显示名，缺失则无法在 App 中识别"),
    ("bookSourceType", "error", "必须指定：0=文本 1=音频 2=图片 3=文件"),
    ("searchUrl", "error", "搜索地址，缺失则无法搜索"),
    # ruleSearch
    ("ruleSearch", "error", "搜索规则，缺失则无法搜索"),
    ("ruleSearch.bookList", "warning", "搜索结果列表容器，缺失则搜索无结果"),
    ("ruleSearch.name", "warning", "书名字段，缺失则搜索列表不显示书名"),
    ("ruleSearch.author", "warning", "作者字段，缺失则搜索列表不显示作者"),
    ("ruleSearch.bookUrl", "warning", "详情页链接，缺失则无法进入详情"),
    # ruleBookInfo
    ("ruleBookInfo", "warning", "详情规则，缺失则无法查看书籍详情"),
    ("ruleBookInfo.name", "warning", "详情-书名"),
    ("ruleBookInfo.intro", "warning", "详情-简介"),
    ("ruleBookInfo.coverUrl", "warning", "详情-封面"),
    # ruleToc
    ("ruleToc", "error", "目录规则，缺失则无法获取章节列表"),
    ("ruleToc.chapterList", "error", "章节列表容器，缺失则目录为空"),
    ("ruleToc.chapterName", "error", "章节名，缺失则目录列表不显示章节标题"),
    ("ruleToc.chapterUrl", "error", "章节链接，缺失则无法进入正文"),
    # ruleContent
    ("ruleContent", "error", "正文规则，缺失则无法阅读"),
    ("ruleContent.content", "error", "正文内容选择器，缺失则正文为空"),
]


def check_required_fields(data):
    """Check that essential book source fields exist. Returns (errors, warnings)."""
    errors, warnings = [], []

    for path, severity, msg in REQUIRED_FIELDS:
        parts = path.split(".")
        obj = data
        found = True
        for key in parts:
            if isinstance(obj, dict) and key in obj and obj[key] != "":
                obj = obj[key]
            else:
                found = False
                break
        if not found:
            entry = f"缺少 {path} — {msg}"
            if severity == "error":
                errors.append(entry)
            else:
                warnings.append(entry)

    # searchUrl special: empty string counts as missing
    if isinstance(data.get("searchUrl"), str) and data["searchUrl"].strip() == "":
        errors.append("searchUrl 为空字符串 — 搜索地址必填")

    return errors, warnings


# ── Main ──────────────────────────────────────────────────────────────

def validate(filepath):
    if filepath == '-':
        try:
            data = json.load(sys.stdin)
        except json.JSONDecodeError as e:
            print(f"❌ Invalid JSON: {e}")
            return 1
    else:
        with open(filepath, 'r', encoding='utf-8') as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError as e:
                print(f"❌ Invalid JSON: {e}")
                return 1

    snippets = extract_js_from_json(data)

    # Always run structure check, even without JS
    struct_errors, struct_warnings = check_required_fields(data)

    if snippets:
        print(f"Found {len(snippets)} JS snippet(s):")
        for path, code in snippets:
            preview = code[:90].replace('\n', '\\n')
            print(f"  [{path}] {preview}{'…' if len(code) > 90 else ''}")
    else:
        print("(No JavaScript code found in the book source.)")

    errors = list(struct_errors)
    warnings = list(struct_warnings)

    for path, code in snippets:
        for severity, msg in check_rhino_issues(code):
            (errors if severity == "error" else warnings).append(f"[{path}] {msg}")

        for msg in check_java_apis(code):
            errors.append(f"[{path}] {msg}")

        for msg in check_brace_balance(code):
            errors.append(f"[{path}] {msg}")

        for msg in check_bare_return(code):
            errors.append(f"[{path}] {msg}")

        for msg in check_browser_apis(code, path):
            errors.append(f"[{path}] {msg}")

    # ── Report ──
    if errors:
        print(f"\n❌ {len(errors)} error(s):")
        for e in errors:
            print(f"  • {e}")

    if warnings:
        print(f"\n⚠️  {len(warnings)} warning(s):")
        for w in warnings:
            print(f"  • {w}")

    if not errors and not warnings:
        print("\n✅ All checks passed!")

    total = len(errors) + len(warnings)
    print(f"\n─── {len(snippets)} snippet(s), {len(errors)} error(s), "
          f"{len(warnings)} warning(s) ───")
    if total == 0:
        print("Ready to import into Legado.")
    else:
        print("Review the issues above before importing into Legado.")

    return 1 if errors else 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <booksource.json>")
        print(f"       cat booksource.json | {sys.argv[0]} -")
        sys.exit(1)
    sys.exit(validate(sys.argv[1]))
