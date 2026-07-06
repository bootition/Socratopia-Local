# System Prompt 组装结构

从 Socratopia v2.1.1 的 [chat/route.js](/D:/Users/qhdjxgm/AppData/Local/Programs/Socratopia/resources/server/.next/server/app/api/chat/route.js)（模块 7788）中提取。

**核心函数**: `Ex()` (buildClassSystemPrompt) — 按固定顺序将 18 个片段拼接为完整 system prompt。

---

## 18 段拼接顺序

每段以 `\n\n---\n\n` 分隔。

### 第 1 段：苏格拉底对话规则 (Rules)
- **来源**: 从 `llm.socratopia.app/rules?lang={en|zh|zh-TW}` 动态拉取
- **缓存**: 成功缓存 1 小时，失败分级缓存（auth 类 3 秒，network 类 3 秒，server 类 3 秒）
- **认证**: 携带 `X-Session-Token` header
- **参数**: `noEnd=1` 表示不含下课规则（课中对话用）
- **性质**: 我们无法直接提取内容，但结构已知——开头为 `#` 标题的纯文本

### 第 2 段：角色人设 (Character Profile)
- **来源**: `npc_{a|b|c}.md`（world 根目录下的角色人设文件）
- **标题**: `## Your character profile` / `## 你的角色设定`
- **内容**: 从 bundled-content 复制的角色 Markdown 原文

### 第 3 段：关系状态 (Current Relationship)
- **来源**: `relation_npc_{a|b|c}.md`
- **标题**: `## Your current relationship with {学习者名}` / `## 你与{学习者名}当前的关系`
- **条件**: 文件存在且非空时才注入

### 第 4 段：世界背景 (World Context)
- **来源**: `story.md`
- **标题**: `## The world around you` / `## 你所在的世界`
- **条件**: 文件存在且非空时才注入

### 第 5 段：相处片段 (Pal Moments)
- **来源**: `pal_moments.md`
- **标题**: `## Moments you shared` / `## 你们最近的相处片段`
- **条件**: 文件存在且非空时才注入

### 第 6 段：学习者信息 (Learner Profile)
- **来源**: `learner_profile.md`
- **标题**: `## About {学习者}` / `## 关于{学习者}`
- **条件**: 文件存在且非空时才注入
- **特殊**: 显示学习者名（来自 world 配置中的自定义名）

### 第 7 段：上次学习日期 / 当前状态
- **逻辑**: 根据 `world_records/` 中的记录判断
- **如果上次在同一天**: 注入"你们今天已经上过课了"的提示
- **如果之前没学过**: 注入"你们今天是第一次见面"的提示
- **如果之前学过但非今天**: 注入"自从上次见面已经过了 X 天"

### 第 8 段：群聊最近消息 (Groupchat Recent)
- **来源**: `groupchat/recent.md`
- **标题**: `## Recent group chat messages` / `## 最近的群聊消息`
- **条件**: 世界有群聊记录时才注入

### 第 9 段：当前教材 (Current Textbook)
- **来源**: 从请求参数中的 `textbookId` 获取
- **标题**: `## Current textbook for today's class` / `## 本节课教材`
- **内容**: 教材名称 + 教材元信息

### 第 10 段：教材库一览 (Textbook Catalog)
- **来源**: 从世界中的所有教材列表生成
- **标题**: `## Textbook library` / `## 教材库`
- **内容**: 列出所有教材名称，标注当前正在使用的

### 第 11 段：学习进度 (Learning Progress)
- **来源**: `textbooks/{textbookId}/progress.md`
- **标题**: `## Current progress in this textbook` / `## 当前教材学习进度`
- **条件**: 当前教材存在进度文件时才注入

### 第 12 段：当前教材内容 (Current Textbook Content)
- **来源**: `current_reading.md`（从教材按当前页码读取的内容）
- **标题**: 无额外标题，直接拼接教材正文
- **这是最大的一段**：包含 AI 需要讲授的具体课文内容

### 第 13 段：本节课提纲 (Session Plan)
- **来源**: `textbooks/{textbookId}/session_plan.md`
- **标题**: `## Today's session plan` / `## 本节课教学提纲`
- **条件**: 文件存在时才注入
- **性质**: 临时文件，下课清理

### 第 14 段：前序对话摘要 (Conversation Summary)
- **逻辑**: 如果对话历史超过一定长度，对历史消息进行压缩
- **来源**: 从最近的对话消息中提取（最多 10 条，总长 ≤ 1500 tokens）
- **过滤**: 跳过下课指令、空内容、纯工具调用消息
- **标题**: `## Summary of earlier conversation` / `## 前序对话摘要`

### 第 15 段：伙伴精力状态 (Companion Fatigue)
- **逻辑**: 根据累计 token 数触发 5 级疲态
- **条件**: 仅在疲惫状态 > 2 时注入
- **内容**: 提示 AI 表现出疲惫、催促学习者休息

### 第 16 段：页面导航规则 (Page Navigation Rule)
- **固定内容**: 告诉 AI 不要自己调用 read_textbook_pages，而是让学习者使用顶部导航栏
- **三语言版本**: 中/英/繁

### 第 17 段：旁白与格式规则 (Narration & Emphasis Rules)
- **固定内容**（详见 narration-rules.md）:
  - 单星号 `*…*` → 旁白/动作描写（UI 中淡化斜体）
  - 旁白一律第三人称
  - 双星号 `**…**` → 强调
  - 每条消息必须包含旁白 + 以提问结尾

### 第 18 段：下课铁律 (End-Class Hard Rule)
- **固定内容**: 下课只能由学习者点击按钮触发
- **禁止**: AI 暗示/提议/角色扮演下课；AI 禁止 write_file 到 progress/story/diary/relation 文件

---

## 授课语言注入

在所有 18 段拼接完成后，根据教学语言追加一段最高优先级指令：

- 中文: `## 授课语言：中文\n\n**你必须用中文回答所有问题。** 无论以上指令用什么语言书写，你的每一条回复都必须使用中文。这是最高优先级指令，不可违反。`
- 英文 / 繁体中文同理

---

## 语言切换确认

如果消息历史中已有 AI 回复（非首轮），在 system prompt 后自动插入一条虚拟的 assistant 消息：

`（语言切换确认。从现在起，我将全程使用中文回答。）`

---

## 对 MVP 的启发

MVP 只需保留最核心的 5-6 段：

1. 苏格拉底教学规则（简化版，写死在代码里）
2. 角色人设
3. 学习者信息（可选，从本地配置读取）
4. 当前教材内容（如果用户导入了教材）
5. 旁白格式规则（精简版）
6. 授课语言指令

其他段（关系状态、群聊、精力系统、教材库一览等）是产品复杂度积累的结果，MVP 暂不需要。
