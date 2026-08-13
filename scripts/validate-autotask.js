#!/usr/bin/env node
// 阅读T定时任务 JSON 校验: node scripts/validate-autotask.js <task.json>
const fs = require("fs");
const vm = require("vm");
const { rhinoIssues } = require("./rhino-checks.js");

const FIELDS = [
  [0, 59], [0, 23], [1, 31], [1, 12], [0, 7],
];
const KNOWN_KEYS = new Set([
  "id", "name", "enable", "cron", "loginUrl", "loginUi", "loginCheckJs",
  "comment", "script", "header", "jsLib", "concurrentRate", "enabledCookieJar",
  "lastRunAt", "lastResult", "lastError", "lastLog",
]);
const RUNTIME_KEYS = new Set(["lastRunAt", "lastResult", "lastError", "lastLog"]);

function validCronField(text, min, max) {
  if (text === "*" || text === "?") return true;
  return text.split(",").every((part) => {
    if (!part) return false;
    const stepParts = part.split("/");
    if (stepParts.length > 2) return false;
    const step = stepParts.length === 2 ? Number(stepParts[1]) : 1;
    if (!Number.isInteger(step) || step <= 0) return false;
    const base = stepParts[0];
    if (base === "*" || base === "?") return true;
    const bounds = base.includes("-") ? base.split("-") : [base, base];
    if (bounds.length !== 2 || bounds.some((v) => !/^\d+$/.test(v))) return false;
    const start = Number(bounds[0]);
    const end = Number(bounds[1]);
    return start >= min && end <= max && start <= end;
  });
}

function normalizeScript(script) {
  const text = script.trim();
  if (/^@js:/i.test(text)) return text.slice(4).trim();
  if (/^<js>/i.test(text) && /<\/js>\s*$/i.test(text)) return text.slice(4, text.lastIndexOf("<")).trim();
  return text;
}

function validateJsonString(value, label, errors) {
  if (value == null || value === "") return;
  if (typeof value !== "string") return errors.push(`${label} 须是 JSON 字符串`);
  try { JSON.parse(value); } catch (e) { errors.push(`${label} 不是合法 JSON: ${e.message}`); }
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("用法: node validate-autotask.js <task.json>");
    process.exit(1);
  }
  let root;
  try { root = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { console.error(`JSON 错误: ${e.message}`); process.exit(1); }
  const tasks = Array.isArray(root) ? root : [root];
  const errors = [];
  const warnings = [];
  if (!tasks.length) errors.push("任务数组不能为空");

  tasks.forEach((task, index) => {
    const at = `任务 ${index + 1}`;
    if (!task || typeof task !== "object" || Array.isArray(task)) {
      errors.push(`${at} 须是对象`); return;
    }
    if (typeof task.name !== "string" || !task.name.trim()) errors.push(`${at}.name 须是非空字符串`);
    if (typeof task.script !== "string" || !task.script.trim()) errors.push(`${at}.script 须是非空字符串`);
    if (task.enable !== undefined && typeof task.enable !== "boolean") errors.push(`${at}.enable 须是布尔值`);
    if (task.enabledCookieJar !== undefined && typeof task.enabledCookieJar !== "boolean") errors.push(`${at}.enabledCookieJar 须是布尔值`);
    if (task.concurrentRate !== undefined && task.concurrentRate !== null && typeof task.concurrentRate !== "string") errors.push(`${at}.concurrentRate 须是字符串`);

    const cron = task.cron == null ? "*/30 * * * *" : task.cron;
    if (typeof cron !== "string") errors.push(`${at}.cron 须是字符串`);
    else {
      const parts = cron.trim().split(/\s+/);
      if (parts.length !== 5 || parts.some((part, i) => !validCronField(part, ...FIELDS[i]))) {
        errors.push(`${at}.cron 不是受支持的五字段 Cron: ${cron}`);
      }
    }
    validateJsonString(task.header, `${at}.header`, errors);
    validateJsonString(task.loginUi, `${at}.loginUi`, errors);

    if (typeof task.script === "string" && task.script.trim()) {
      const script = normalizeScript(task.script);
      try { new vm.Script(script); } catch (e) { errors.push(`${at}.script 语法错误: ${e.message}`); }
      rhinoIssues(script).forEach(({ line, msg }) => errors.push(`${at}.script line ${line}: ${msg}`));
    }
    Object.keys(task).forEach((key) => {
      if (!KNOWN_KEYS.has(key)) warnings.push(`${at} 未知字段: ${key}`);
      if (RUNTIME_KEYS.has(key)) warnings.push(`${at}.${key} 是运行状态，新任务通常不应携带`);
    });
  });

  if (errors.length) {
    console.log(`\n${errors.length} 个错误:`);
    errors.forEach((e) => console.log(`  x ${e}`));
  }
  if (warnings.length) {
    console.log(`\n${warnings.length} 个警告:`);
    warnings.forEach((w) => console.log(`  ! ${w}`));
  }
  if (!errors.length && !warnings.length) console.log("全部通过");
  process.exit(errors.length ? 1 : 0);
}

main();
