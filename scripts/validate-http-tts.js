#!/usr/bin/env node
// 阅读T HTTP 在线朗读引擎 JSON 校验: node scripts/validate-http-tts.js <http-tts.json>
const fs = require("fs");

const GENDERS = new Set(["male", "female", "unknown"]);
const AGES = new Set(["child", "young", "middle", "old", "unknown"]);
const KNOWN_KEYS = new Set([
  "id", "name", "url", "contentType", "concurrentRate", "loginUrl", "loginUi",
  "header", "jsLib", "enabledCookieJar", "loginCheckJs", "pauseDuration", "voices",
  "lastUpdateTime",
]);

function parseJsonField(value, label, errors) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return errors.push(`${label} 须是 JSON 字符串`), null;
  try { return JSON.parse(value); }
  catch (e) { errors.push(`${label} 不是合法 JSON: ${e.message}`); return null; }
}

function validateLoginUi(value, label, errors) {
  if (value == null || value === "") return;
  if (Array.isArray(value)) return;
  const parsed = parseJsonField(value, label, errors);
  if (parsed !== null && !Array.isArray(parsed)) errors.push(`${label} 须表示数组`);
}

function parseVoices(value, label, errors) {
  if (value == null || value === "") return [];
  let voices = value;
  if (typeof voices === "string") {
    try { voices = JSON.parse(voices); }
    catch (e) { errors.push(`${label} 不是合法 JSON: ${e.message}`); return []; }
  }
  if (!Array.isArray(voices)) {
    errors.push(`${label} 须是数组或序列化后的数组字符串`); return [];
  }
  const ids = new Set();
  voices.forEach((voice, index) => {
    const at = `${label}[${index}]`;
    if (!voice || typeof voice !== "object" || Array.isArray(voice)) {
      errors.push(`${at} 须是对象`); return;
    }
    const id = typeof voice.id === "string" ? voice.id.trim() : "";
    if (!id) errors.push(`${at}.id 须是非空字符串`);
    else if (ids.has(id)) errors.push(`${label} 音色 id 重复: ${id}`);
    else ids.add(id);
    if (voice.name !== undefined && typeof voice.name !== "string") errors.push(`${at}.name 须是字符串`);
    if (voice.gender != null && voice.gender !== "" && !GENDERS.has(String(voice.gender).trim().toLowerCase())) errors.push(`${at}.gender 值无效: ${voice.gender}`);
    if (voice.age != null && voice.age !== "" && !AGES.has(String(voice.age).trim().toLowerCase())) errors.push(`${at}.age 值无效: ${voice.age}`);
  });
  return voices;
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("用法: node validate-http-tts.js <http-tts.json>");
    process.exit(1);
  }
  let root;
  try { root = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { console.error(`JSON 错误: ${e.message}`); process.exit(1); }
  const engines = Array.isArray(root) ? root : [root];
  const errors = [];
  const warnings = [];
  if (!engines.length) errors.push("引擎数组不能为空");

  engines.forEach((engine, index) => {
    const at = `引擎 ${index + 1}`;
    if (!engine || typeof engine !== "object" || Array.isArray(engine)) {
      errors.push(`${at} 须是对象`); return;
    }
    if (typeof engine.name !== "string" || !engine.name.trim()) errors.push(`${at}.name 须是非空字符串`);
    if (typeof engine.url !== "string" || !engine.url.trim()) errors.push(`${at}.url 须是非空字符串`);
    if (engine.id !== undefined && (!Number.isInteger(engine.id))) errors.push(`${at}.id 须是整数`);
    if (engine.concurrentRate !== undefined && engine.concurrentRate !== null && typeof engine.concurrentRate !== "string") errors.push(`${at}.concurrentRate 须是字符串`);
    if (engine.enabledCookieJar !== undefined && engine.enabledCookieJar !== null && typeof engine.enabledCookieJar !== "boolean") errors.push(`${at}.enabledCookieJar 须是布尔值`);
    if (engine.pauseDuration !== undefined && (!Number.isInteger(engine.pauseDuration) || engine.pauseDuration < 0)) errors.push(`${at}.pauseDuration 须是非负整数`);
    parseJsonField(engine.header, `${at}.header`, errors);
    validateLoginUi(engine.loginUi, `${at}.loginUi`, errors);
    const voices = parseVoices(engine.voices, `${at}.voices`, errors);
    if (voices.length > 1 && typeof engine.url === "string" && !engine.url.includes("speakVoice")) {
      errors.push(`${at} 配置了多个音色，但 url 未消费 speakVoice`);
    }
    if (typeof engine.url === "string" && !engine.url.includes("speakText")) warnings.push(`${at}.url 未引用 speakText，请确认接口如何接收文本`);
    if (engine.lastUpdateTime !== undefined) warnings.push(`${at}.lastUpdateTime 是应用维护字段，新引擎通常不必填写`);
    Object.keys(engine).forEach((key) => {
      if (!KNOWN_KEYS.has(key)) warnings.push(`${at} 未知字段: ${key}`);
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
