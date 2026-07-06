# LLM 工具定义 (Tool Definitions)

从 Socratopia v2.1.1 的 [chunk 9654.js](/D:/Users/qhdjxgm/AppData/Local/Programs/Socratopia/resources/server/.next/server/chunks/9654.js)（模块 73358）中提取。

Socratopia 为 LLM 定义了 5 个 OpenAI function-calling 格式的工具，仅在与 DeepSeek 模型交互时启用（模拟工具调用，非真正的 agent loop）。

---

## 工具列表

### 1. read_file
- **用途**: 读取世界级或教材级文件
- **参数**:
  - `path` (string, required): 相对路径，如 `story.md` 或 `textbooks/YGab/progress.md`
- **限制**: 只能读已存在的文件
- **UI 标签**: 根据文件类型动态生成（如"回想往事"、"翻看日记"、"看看群消息"等）

### 2. write_file
- **用途**: 写入世界级或教材级文件
- **参数**:
  - `path` (string, required): 相对路径
  - `content` (string, required): 完整内容
- **重要限制**: 
  - 正常教学轮次中 progress.md / story.md / diary 条目 / relation_npc_*.md 被拦截（静默返回成功但不写入）
  - 仅下课流程和女娲模式可真正写入这些文件
  - 课内合法写入仅限于 toc.json 纠错等场景
- **特殊逻辑**: 如果写入的是 progress.md，自动解析"当前页码"字段并同步到教材索引

### 3. read_textbook_pages
- **用途**: 读取教材指定页码的内容
- **参数**:
  - `startPage` (number, required): 逻辑页码（从 1 开始）
  - `targetTokens` (number, optional): 目标 token 数，默认 10000，最大 20000
- **限制**: 仅用于学习者主动要求的章节跳转；教材内容会随教学进度自动补充
- **实现**:
  - PDF: 使用 pdfjs-dist 提取文本，输入 4x 冗余读取后裁剪
  - EPUB/Markdown: 使用自适应提取器，支持 pages.json 分页缓存
- **输出**: 裁剪后的教材正文 + 阅读窗口范围
- **副作用**: 写入 current_reading.md（会话级）、更新阅读窗口元数据

### 4. delete_file
- **用途**: 删除世界级或教材级文件
- **参数**:
  - `path` (string, required): 相对路径，如 `textbooks/YGab/session_plan.md`
- **限制**: 仅用于删除课内临时文件；文件不存在时静默成功

### 5. get_textbook_toc
- **用途**: 获取当前教材的目录
- **参数**: 无
- **限制**: 每节课最多调用一次
- **输出**:
  - PDF: 优先使用 toc.json 智能目录
  - 其他格式: 从文件结构提取
  - 包含章节标题和逻辑页码
  - 附带页码偏移量信息（PDF 页码 = 书页码 + offset）

---

## 工具调用流程

仅 DeepSeek 模型在启用 Nuwa 模式（女娲/世界编辑模式）时触发工具调用：

```
LLM 返回 tool_calls
    │
    ├→ 对每个 tool_call:
    │   ├→ 发送 {type: "tool_use", name, label} 给前端
    │   ├→ 执行工具函数
    │   ├→ 发送 {type: "tool_result", name, label, path} 给前端
    │   └→ 将 tool 响应追加到消息历史
    │
    └→ 重新调用 LLM（携带工具结果）
        （最多 10 轮工具调用循环）
```

**DeepSeek thinking 模式**: 如果模型支持 reasoning_content，`<think>` 标签在流式输出中被实时剥离并单独发送给前端。

---

## token 计数规则

用于内容裁剪的 token 估计算法：

- **CJK 字符**（中日韩）: 1 字符 = 1 token
- **非 CJK 字符**: 1 字符 = 0.25 token（即 4 字符 ≈ 1 token）

CJK Unicode 范围:
- `0x4E00-0x9FFF` — CJK 统一表意文字
- `0x3400-0x4DBF` — CJK 扩展 A
- `0x20000-0x2A6DF` — CJK 扩展 B
- `0x3040-0x309F` — 日文平假名
- `0xAC00-0xD7AF` — 韩文音节

---

## 对 MVP 的启发

MVP 第一阶段**不需要**工具调用（function calling）。原因：

1. Socratopia 的工具调用是为世界编辑模式（女娲）设计的，正常教学对话不走工具调用路径
2. 教材内容的注入在 MVP 中可以通过简单的"用户上传文本 → 拼进 system prompt"实现
3. function calling 增加了 LLM 调用的复杂度和 token 消耗

当 MVP 进入 Phase 2（教材阅读 + 多轮教学）后，`read_textbook_pages` 是最值得实现的工具——它让 AI 能自主决定"读到哪了、需要往前翻还是往后续"。
