# 文件布局与数据模型

从 Socratopia v2.1.1 编译产物中逆向提取的本地文件组织结构。

**源文件**: `resources/server/.next/server/chunks/9654.js`（模块 73909 对话 CRUD、模块 73358 工具执行）、`resources/server/.next/server/app/api/chat/route.js`（模块 7788 下课写入逻辑）

---

## 完整目录结构

```
{PROJECT_ROOT}/
├── device_id                          # 设备标识（12 位随机字母数字）
│
├── profiles/
│   └── {profileId}/                   # 用户档案（默认 "default"）
│       │
│       ├── active_world.json          # 当前活跃世界 + 教材引用
│       │
│       └── worlds/
│           └── {worldId}/             # 一个学习世界（默认 "default"）
│               │
│               ├── story.md           # 世界观叙事（持久，持续更新）
│               ├── learner_profile.md # AI 对学习者的认知画像
│               ├── pal_moments.md     # 教学互动备忘
│               ├── world_records/     # 世界事件时间线
│               │
│               ├── npc_a.md           # 伙伴槽位 A 的人设
│               ├── npc_b.md           # 伙伴槽位 B 的人设
│               ├── npc_c.md           # 伙伴槽位 C 的人设
│               │
│               ├── relation_npc_a.md  # 伙伴 A 与学习者的关系状态
│               ├── relation_npc_b.md  # 伙伴 B 与学习者的关系状态
│               ├── relation_npc_c.md  # 伙伴 C 与学习者的关系状态
│               │
│               ├── groupchat/
│               │   └── recent.md      # 群聊最近消息
│               │
│               ├── diary/
│               │   └── YYYY-MM.md     # 月度日记（按年月拆分文件）
│               │
│               ├── textbooks/
│               │   └── {textbookId}/
│               │       ├── progress.md           # 教材学习进度
│               │       ├── current_reading.md    # 当前阅读窗口（世界级共享）
│               │       ├── session_plan.md       # 本节课提纲（临时，下课清理）
│               │       ├── toc.json              # 智能目录（PDF 优先）
│               │       ├── pages.json            # 分页缓存
│               │       ├── handoff_tail.json     # 跨会话消息接力（尾部消息）
│               │       └── handoff_meta.json     # 接力元数据
│               │
│               ├── conversations/
│               │   └── {convId}/
│               │       ├── {messageId}.json      # 每条消息独立文件
│               │       ├── current_reading.md    # 会话级阅读窗口
│               │       │                          # 格式: <!-- startPage: N endPage: M -->
│               │       └── current_reading_summary.json  # 阅读窗口摘要
│               │
│               └── lesson_summaries/
│                   └── {convId}.md               # 课后 AI 总结
│
└── custom_companions/                 # 自定义角色
    ├── index.json                     # 角色注册表（最多 20 个）
    ├── ct_{id}.md                     # 角色人设
    └── ct_{id}.{png|jpg|webp}        # 角色头像
```

---

## 核心文件职责与规则

### story.md
- **用途**: 世界叙事 + 角色关系 + 近期事件
- **读写**: 课堂中 read_file 可读，write_file 禁写（仅下课流程可写）
- **限制**: ≤ 4000 tokens
- **System Prompt 中的位置**: 作为"过去状态"注入，AI 被告知这仅供理解历史

### learner_profile.md
- **用途**: AI 对学习者认知水平、薄弱点、习惯的持续画像
- **读写**: read_file 可读，write_file 禁写（仅下课流程可写）
- **限制**: ≤ 1500 tokens
- **System Prompt 中的位置**: 学习者信息段

### pal_moments.md
- **用途**: 对后续教学有用的互动备忘（难点、关键问答、突破时刻）
- **格式**: `## YYYY-MM-DD | 伙伴名` + 内容段
- **读写**: 课时不可见（服务器故意不传给 AI），下课时 AI 生成新条目，服务器自动合并
- **限制**: ≤ 1800 字符总长（合并时按长度裁剪旧条目）
- **设计意图**: 下次课伙伴可提起这些让学习者感到"被记得"，也起复习作用

### progress.md
- **用途**: 每本教材的独立学习进度
- **路径**: `textbooks/{textbookId}/progress.md`
- **读写**: read_file 可读，write_file 禁写（仅下课流程可写）
- **内容格式**: 包含 "当前页码：N" 字段，服务器自动解析并同步到教材索引

### diary/YYYY-MM.md
- **用途**: 按月份的日记，每次下课追加一条
- **读写**: read_file 可读，write_file 禁写（仅下课流程可写）
- **格式**: 条目以 `---` 分隔

### relation_npc_{a|b|c}.md
- **用途**: 特定伙伴与学习者的关系状态
- **读写**: 仅下课流程可写
- **限制**: ≤ 150 tokens（极端压缩）
- **可选**: 如果关系无变化，此段可留空

### npc_{a|b|c}.md
- **用途**: 伙伴槽位填充的角色人设（从 bundled-content 复制而来）
- **路径**: world 根目录
- **限制**: ≤ 1500 tokens
- **System Prompt 中的位置**: 角色人设段

### handoff_tail.json / handoff_meta.json
- **用途**: 跨会话接力机制
- **handoff_tail.json**: 保存上节课末尾的对话消息（最多若干条）
  - 格式: `{"savedAt": "ISO时间", "messages": [{role, content}, ...]}`
- **handoff_meta.json**: 接力元数据
  - 格式: `{"savedAt": "...", "prevConvId": "...", "companionName": "...", "companionSlot": "...", "endingPage": N}`
- **工作流**:
  1. 下课时写入 handoff_tail + handoff_meta
  2. 新课开始时，检测到 handoff_tail 存在 → 注入"上一节课的对话尾巴"到 system prompt
  3. 超过 8 条消息后自动清理（decay）
  4. 有竞态保护（savedAt 时间戳比对）

### conversations/{convId}/
- **用途**: 对话持久化，每条消息一个 JSON 文件
- **格式**: 每个文件包含 `{id, role, content, createdAt}`
- **排序**: 按 createdAt 倒序读取

### current_reading.md（两种）
- **世界级**: `textbooks/{id}/current_reading.md` — 当前教材的阅读窗口
- **会话级**: `conversations/{convId}/current_reading.md` — 当前会话的阅读窗口
- **格式**: `<!-- startPage: N endPage: M -->\n` + 教材内容
- **机制**: 首次进入课堂时自动读取教材当前页内容，写入此文件作为 AI 上下文

---

## 状态流转图

```
课堂开始
  │
  ├→ 读取 current_reading.md（如果存在）→ 教材内容注入 system prompt
  ├→ 读取 handoff_tail.json（如果存在）→ 历史对话注入 system prompt
  ├→ 清理 session_plan.md（如果存在）
  │
  ▼
[正常教学轮次]
  ├→ 每条消息写入 conversations/{convId}/{msgId}.json
  ├→ 每隔若干轮执行教学教练分析（meta-analysis）
  │    └→ 产出 companionBehavior / learnerEngagement / responsePlaybook
  ├→ 教材内容自动补充（阅读窗口过半时触发）
  │
  ▼
[下课触发]
  ├→ LLM 生成 7 段输出（===FAREWELL=== 等）
  ├→ 服务器解析 → 写入 pal_moments.md（合并旧条目）
  ├→              写入 progress.md
  ├→              写入 diary/YYYY-MM.md（追加）
  ├→              写入 relation_npc_{x}.md
  ├→              写入 handoff_tail.json + handoff_meta.json
  ├→              写入 world_records/（世界事件记录）
  ├→ 清理 current_reading.md
  ├→ 清理 lesson_summaries/{convId}.md
  └→ 清理 conversations/{convId}/current_reading_summary.json
```

---

## 对 MVP 的启发

MVP 不需要完整复刻这套布局。关键要保留的设计意图：

1. **对话持久化** → conversations/ 的单文件 per-message 模式，或简化为单文件 per-conversation JSON
2. **进度跟踪** → progress.md 的"当前页码"概念，也可以扩展为更通用的进度标记
3. **跨会话记忆** → handoff 的"尾巴注入"思路，MVP 可以直接把上节课最后 N 条消息拼进 system prompt
4. **关系状态** → relation 文件的极端压缩策略（150 tokens），MVP 可以不保留
5. **日记** → 按月拆分的 diary 是个好模式，MVP 可以简化为一周一篇
