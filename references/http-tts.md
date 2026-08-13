# HTTP 在线朗读引擎

## 边界

HTTP 在线朗读引擎是 `HttpTTS` 配置，用远程语音接口把文本转换为可播放音频。它不是听书源，也不是 Android 系统 TTS。此分支负责请求规则、认证、响应类型与音色候选；播放控制、系统 TTS、角色标注和角色配音管理属于 App 功能。

当前 MCP 没有 HTTP 在线朗读引擎的保存、预览或播放工具。交付可导入 JSON；用户在 App 的在线朗读引擎编辑页粘贴/导入并预览。

## 工作流

1. 取得真实 TTS 请求样本：URL、方法、头、请求体、文本/语速/音色参数、鉴权和音频响应。完成标准：同一请求可在授权环境中稳定返回音频。
2. 将动态值改为 URL 规则绑定：`speakText`、`speakSpeed`、`speakVoice`。完成标准：文本正确转义，选中音色能到达接口。
3. 配置登录与错误处理。需要登录 UI 时看 [[login.md]]，规则 API 看 [[js-api.md]]。完成标准：凭据不硬编码，非音频响应能暴露服务端错误。
4. 定义音色候选并运行 `scripts/validate-http-tts.js`。完成标准：JSON 与音色清单严格校验通过。
5. 交付导入 JSON 和 App 内预览步骤；未真实试听时明确标注。

## JSON 契约

```json
{
  "id": 1720000000000,
  "name": "示例 HTTP 朗读",
  "url": "https://tts.example.com/v1/audio,{\"method\":\"POST\",\"body\":{\"text\":\"{{speakText}}\",\"speed\":{{String(speakSpeed)}},\"voice\":\"{{speakVoice}}\"}}",
  "contentType": "audio/mpeg",
  "concurrentRate": "0",
  "enabledCookieJar": false,
  "pauseDuration": 0,
  "voices": [
    {"id": "female-1", "name": "女声 1", "gender": "female", "age": "young"},
    {"id": "male-1", "name": "男声 1", "gender": "male", "age": "middle"}
  ]
}
```

必填字段：`name`、`url`。常用可选字段：`id`、`contentType`、`concurrentRate`、`header`、`loginUrl`、`loginUi`、`loginCheckJs`、`enabledCookieJar`、`pauseDuration`、`voices`、`jsLib`。

导入器接受 `voices` 为 JSON 数组或序列化后的 JSON 数组字符串；新产物优先直接输出数组，可读性更好。空字段或缺少 `voices` 表示引擎提供一个可分配的默认音色，不表示没有音色。

## URL 规则绑定

- `speakText`：当前待合成文本。
- `speakSpeed`：阅读T语速，UI 配置范围 0-45，传给引擎时 +5 偏移为 5-50。按服务端契约映射，不假定单位相同。
- `speakVoice`：当前选择的引擎音色 ID。配置多个音色时，请求规则必须消费它。

URL 规则与书源 URL 规则相同，可声明 `method`、`body`、`headers` 等。JSON 请求体中的字符串必须按目标接口正确转义；表单请求按接口要求使用 `java.encodeURI`。

`contentType` 填服务端实际音频 MIME，例如 `audio/mpeg`、`audio/wav`。接口可能以 JSON 返回错误时，用 `loginCheckJs` 检查响应、刷新登录态或抛出可读错误；不要把错误 JSON 当音频。

## 音色候选

每项字段：

- `id`：必填、非空、引擎内唯一；传给 `speakVoice`。
- `name`：显示名；缺省时运行时回退为 `id`。
- `gender`：`male`、`female`、`unknown`。
- `age`：`child`、`young`、`middle`、`old`、`unknown`。

性别和年龄是角色画像匹配属性，不是角色身份。音色候选只描述引擎可选音色，不在这里创建角色配音。

## 验证门

- 使用真实或用户授权的接口证据，不猜 endpoint、签名、token 或 voice ID。
- 至少验证一段含中文、标点和特殊字符的文本。
- 多音色配置至少验证两个不同 `speakVoice` 到达服务端并产生预期音频。
- HTTP 状态、`Content-Type` 和响应体符合音频契约；鉴权失败能给出可诊断信息。
- `validate-http-tts.js` 通过；无法在 App 试听时明确“仅接口/语法验证”。
