# Socratopia-Local

以 Socratopia 为产品参考，从零构建的本地优先 AI 苏格拉底式学习伴侣。

当前参考基线：
- 本地逆向基线：Socratopia v2.1.1（2026-06-12 报告）
- 最新公开调研基线：Socratopia v3.2.0（2026-06-27）

## 项目目标

复刻 Socratopia 的核心教学体验：角色化 AI、苏格拉底式追问、教材阅读、学习状态管理、课后学习产物；但完全本地化运行，只服务个人自用，用户自带 DeepSeek API Key，不依赖 Socratopia 的远程代理、订阅服务、社区或书币系统。

## 已锁定决策

| 决策 | 结论 |
|---|---|
| 起步层级 | 直接开始第二层：Electron + React + Tailwind 桌面应用 |
| 角色内容 | 复用 `reference/角色设定/candidates/` 下全部 9 个角色内容 |
| LLM | DeepSeek API only，通过 OpenAI-compatible Chat Completions 接口调用 |
| API Key | 由用户提供，主进程保存，渲染器不接触明文 Key |
| 存储 | 从第一版开始使用本地文件系统持久化，不用临时 localStorage 方案 |
| 用户范围 | 单用户、自用；不做账户、多租户、同步、订阅、支付 |
| 社区/商城 | 不做 Agora、论坛、推荐、书币、教材商城 |

## 关键差异

| 方面 | Socratopia | Socratopia-Local |
|---|---|---|
| LLM 调用 | 经过 `llm.socratopia.app` 代理 | 直连 DeepSeek API |
| 计费 | 订阅 + token 配额 + 书币商城 | 用户自付 DeepSeek API 费用 |
| 数据 | 本地学习数据 + 云端账号/社区/商城 | 纯本地文件系统 |
| 内容 | 官方 AI-generated library + 用户导入 | 用户自己的 PDF/EPUB/Markdown；可引用本地角色和世界观素材 |
| 社区 | Agora、群聊、分享、愿望单、工坊 | 不做 |
| 更新 | 自动更新 | 手动更新 |
| 语音 | Voice Pack / replay controls | 后置，可先用浏览器 TTS 或暂不实现 |
| 用户 | 面向公开用户 | 单用户个人工具 |

## 工作台结构

```text
Socratopia-Local/
├── README.md
├── docs/
│   ├── 产品设计/
│   │   ├── 技术调查.md
│   │   ├── 产品规格.md
│   │   └── 实施计划.md
│   ├── 决策记录/
│   │   ├── adr-001-deepseek-only.md
│   │   ├── adr-002-local-first-storage.md
│   │   ├── adr-003-electron-from-start.md
│   │   ├── adr-004-single-user.md
│   │   └── adr-005-reuse-all-characters.md
│   └── 逆向分析参考/
│       └── Socratopia-逆向分析报告.md
├── reference/
│   ├── 角色设定/
│   ├── prompt-结构/
│   ├── 文件布局/
│   └── world_preset.md
└── src/
```

## 第二层实施路线

第二层不是单页原型，而是直接构建桌面应用骨架和核心学习闭环：

- [ ] Electron 安全壳：main / preload / renderer 分层，`contextIsolation: true`，`nodeIntegration: false`
- [ ] DeepSeek 主进程客户端：API Key 安全保存、模型配置、流式 Chat Completions
- [ ] 本地文件数据层：profile、world、companions、textbooks、conversations、diary、progress
- [ ] 9 角色加载：从 reference 目录导入候选角色并映射到本地世界槽位
- [ ] Prompt 组装器：角色、人设、世界观、教材片段、历史摘要、旁白规则、语言规则
- [ ] 聊天课堂 UI：角色选择、教材上下文、流式回复、Markdown/KaTeX/代码高亮
- [ ] 课后产物：summary、flashcards、diary、progress、handoff tail
- [ ] 搜索与统计：先实现基础对话搜索和学习记录列表，复杂图表后置

## 技术栈

- 桌面壳：Electron
- 前端：React + Tailwind CSS
- LLM：DeepSeek API（OpenAI-compatible）
- 存储：Electron main process + 本地文件系统；API Key 使用 Electron `safeStorage` 或 OS keychain 方案
- 渲染：react-markdown + KaTeX + rehype-highlight
- 输入校验：Zod（IPC 边界、配置、DeepSeek 响应、文件索引）

## 参考源

- 产品规格：[docs/产品设计/产品规格.md](docs/产品设计/产品规格.md)
- 技术调查：[docs/产品设计/技术调查.md](docs/产品设计/技术调查.md)
- 实施计划：[docs/产品设计/实施计划.md](docs/产品设计/实施计划.md)
- 原始逆向分析报告：[docs/逆向分析参考/Socratopia-逆向分析报告.md](docs/逆向分析参考/Socratopia-逆向分析报告.md)
- 原始软件安装路径：`D:\Users\qhdjxgm\AppData\Local\Programs\Socratopia`
