# Code Explain

在 Cursor / VS Code 中选中代码，通过 **任意 OpenAI 兼容 API** 生成逐行讲解、知识点与 AI 批改测验。

> 终端用户使用说明：侧栏点击「打开使用说明」，或命令面板运行 **Code Explain: Open User Guide**。本 README 同时面向 Marketplace 展示与开发调试。

## 功能演示

### 1. 选中代码 → 解析与测验

![选中代码后进行讲解与测验](https://github.com/RoverLion/Code-explain-extension/raw/main/media/demo/explain-quiz.gif)

### 2. 学习中心（进度 / 题库）

![学习中心：进度与题库](https://github.com/RoverLion/Code-explain-extension/raw/main/media/demo/learning-center.gif)

### 3. 回归测试

![回归测试](https://github.com/RoverLion/Code-explain-extension/raw/main/media/demo/regression-test.gif)

## 语言设置（重要）

扩展里有 **三种** 不同的「语言」，容易混淆：

| 类型 | 控制什么 | 如何切换 |
|------|----------|----------|
| **扩展界面语言** | 命令标题、侧栏、面板 UI 文案 | 跟随 **VS Code / Cursor 显示语言**（安装中文语言包并切换 Display Language） |
| **AI 输出语言** | 讲解正文、测验题干、批改反馈 | **设置 → Code Explain → Output Language**（`codeExplain.outputLanguage`：`zh-CN` / `en-US`） |
| **使用说明页语言** | 仅「使用说明」Webview 正文 | 打开使用说明后，**右上角「中文 \| English」**（只改本页，不写设置） |

入口：

1. 活动栏 **Code Explain** → **打开使用说明**
2. 命令面板：`Code Explain: Open User Guide` / `代码讲解：打开使用说明`

## 开发环境

1. 用 **Cursor** 或 **VS Code** 打开本扩展目录（`code-explain-extension`）。
2. 安装依赖并编译：

   ```bash
   npm install
   npm run build
   ```

3. 按 **F5** 启动「Extension Development Host」调试窗口，在新窗口中加载本扩展。

## 配置 AI 模型（OpenAI 兼容）

解析与批改走 `POST {apiBaseUrl}/chat/completions`，兼容 OpenAI、DeepSeek、通义、自建网关等。

| 配置项 | 说明 |
|--------|------|
| `codeExplain.apiBaseUrl` | 默认 `https://api.openai.com/v1` |
| `codeExplain.model` | 默认 `gpt-4o-mini`，按服务商填写模型 id |
| `codeExplain.outputLanguage` | AI 讲解与批改文案语言：`zh-CN`（默认）或 `en-US` |
| `codeExplain.storageRoot` | 学习进度与题库的自定义存储目录（绝对路径）。留空则使用扩展 global storage |
| API Key | 见下表 |

| Key 方式 | 说明 |
|----------|------|
| 命令面板 | **Code Explain: Set AI API Key** → 同时写入 SecretStorage 与用户设置 `codeExplain.apiKey` |
| 环境变量 | `CODE_EXPLAIN_API_KEY` 或 `OPENAI_API_KEY`（仍兼容旧的 `CURSOR_API_KEY`） |
| 设置项 | `codeExplain.apiKey`（命令保存后可在设置中核对；旧项 `cursorApiKey` 仅作迁移兼容） |

优先级：SecretStorage（新）→ SecretStorage（旧 Cursor）→ `apiKey` 设置 → `cursorApiKey` 设置 → 环境变量。

Webview 颜色跟随编辑器主题（`--vscode-*`），深色/浅色下均保证正文与背景对比度。

## 使用

1. 在编辑器中**选中**一段代码。
2. 触发解析：
   - 右键 → **Code Explain: Explain Selection**
   - 快捷键 **Ctrl+Alt+E**（macOS：**Cmd+Alt+E**）
3. 侧栏 Webview 展示逐行讲解、知识点与测验；提交后由 AI 批改。

支持任意 `languageId`（由当前文档语言决定）。

## 学习进度与题库

- 点击活动栏中的 **Code Explain**，在“学习进度”视图中选择“查看学习进度”。
- 也可从命令面板运行 **Code Explain: Learning Progress** 打开进度面板。
- 运行 **Code Explain: Open Question Bank** 可直接打开进度面板并切换到「题库」标签页。
- 面板包含两个标签页：
  - **学习进度**：知识点掌握统计、最近学习会话。
  - **题库**：历次测验题目（选择题与简答题），展示语言、知识点、标签与最近一次批改结果。
- 顶部筛选栏可按 **语言**、**标签**、**关键词** 过滤进度与题库；三个标签页共用同一组筛选条件。
- 题库中点击 ☆/★ 可收藏或取消收藏题目；收藏题目在列表中优先展示，且淘汰时不会被优先清理。
- 测验提交并批改后，题目会自动写入本地题库（最多保留 500 题，优先淘汰未收藏的旧题）。
- 从进度页面点击“清空学习记录”，或运行 **Code Explain: Clear Learning Progress**；确认后将永久删除全部学习记录与题库。

## 回归测试

基于已学语言与薄弱知识点，由 AI 生成**通用面试向**练习卷（与原业务代码 / 讲解题干无关），在独立 Webview 中作答后由 AI 语义批改（**不在本地执行代码**）。

### 如何启动

1. 点击活动栏 **Code Explain** → 在「学习进度」视图中点击 **开始回归测试**。
2. 或从命令面板运行 **Code Explain: Start Regression Test**。
3. 首次使用需已配置 API Key（见上文「配置 AI 模型」）。
4. 启动后选择 **全部已学语言** 或某一具体语言（来自学习进度 / 题库统计）。

### 组卷规则

- **选题方向**：仅从学习进度 / 题库提取语言与知识点主题（薄弱优先），**不会原样复用**讲解测验里的业务题干。
- **出题**：AI 生成 **6** 道自包含题目（含 **恰好 1** 道 `code` 编程题），要求通用、可复用、面试友好；禁止依赖某项目 API / 入参出参约定。
- 试卷包含选择题、简答题与编程题；标准答案不会下发到 Webview。

### 批改与回写

- 提交后由 AI 对全部题型进行语义批改（含手写代码题）；扩展**不会在本地运行或编译用户代码**。
- 批改完成后：
  - AI 题目写入本地题库；
  - 学习进度新增一条「回归测试」会话；进度面板会自动刷新。

### 本地存储

默认保存在扩展 global storage 目录下：

- `learning-progress.json` — 学习进度（v2 格式；首次加载旧版 v1 文件时会自动迁移）
- `question-bank.json` — 题库

若设置 `codeExplain.storageRoot` 为有效绝对路径，上述文件将写入该目录；路径无效或不可写时会回退到默认目录并提示警告。

## 限制说明

- **无法挂载 Cursor 浮动工具栏**（如 Add to Chat 旁的悬浮入口）。本扩展仅通过右键菜单、命令面板与快捷键触发。
- **API Key 不会传入 Webview**；请求仅在扩展主进程（Extension Host）完成。
- 上下文为**选中片段 + 当前文件全文**（受 `maxFileChars` 限制），不再依赖 Cursor Agent 仓库检索。

## 打包（可选）

```bash
npm run package
```

需已安装 `@vscode/vsce`（脚本通过 `npx` 调用）。成功后在目录下生成 `.vsix`，可在扩展视图中「从 VSIX 安装」。

## 验证

```bash
npm test
npm run build
npx tsc --noEmit
```

## 冒烟说明

首次端到端验证需有效 API Key、可访问的 `apiBaseUrl`，以及对应 `model`：选中短代码片段 → 触发解析 → 确认 Webview 出现讲解与测验 → 提交答案 → 确认批改结果。开发预览可用命令 **Code Explain: Preview Webview (dev)**（无需 API）。
