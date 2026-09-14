# Socratopia-Local

以 Socratopia 为产品参考，从零构建的本地优先 AI 苏格拉底式学习伴侣。

当前参考基线：
- 本地逆向基线：Socratopia v2.1.1（2026-06-12 报告）
- 上游最新公开版本：Socratopia **v5.1.0**（2026-09-12，见 [官方 changelog](https://www.socratopia.app/zh/changelog)）
- 上游新功能审查与落地建议：[docs/产品设计/上游功能审查与建议.md](docs/产品设计/上游功能审查与建议.md)

## 下载与安装（普通用户）

> 完整说明与故障排查见 [docs/产品设计/安装与分发说明.md](docs/产品设计/安装与分发说明.md)。

`release/` 目录提供四种分发形态：

| 文件 | 说明 |
|---|---|
| `Socratopia-Local-Setup-User-0.1.0.exe` | 当前用户安装器（推荐，不需要管理员） |
| `Socratopia-Local-Setup-Machine-0.1.0.exe` | 全机安装器（需要 UAC） |
| `Socratopia-Local-Portable-0.1.0.exe` | 便携版，双击即用 |
| `Socratopia-Local-0.1.0-win-x64.zip` | 便携压缩包，解压后运行 `Socratopia-Local.exe` |

安装三步：双击安装器 → 选择安装位置（默认目录不可写时会自动回退并用弹窗告知；全部不可写时会明确报错并让你手动选择）→ 完成，桌面与开始菜单出现 `Socratopia-Local` 图标。

首次启动：粘贴 DeepSeek API Key → 先点「测试连接（不保存）」确认可用 → 保存进入课堂；再到 Textbook 导入教材（Markdown / 文本 / PDF / EPUB / Word）即可上课。

学习数据保存在 `%APPDATA%\Socratopia-Local\Socratopia-Local`；**卸载不会删除数据**（卸载时会提示）。

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
| 社区/商城 | 不做 Agora、论坛、分享、AI Book Finder；上游已于 4.2.0 取消书币，公开教材免费，本项目也不做书城 |

## 关键差异

| 方面 | Socratopia | Socratopia-Local |
|---|---|---|
| LLM 调用 | 经过 `llm.socratopia.app` 代理 | 直连 DeepSeek API |
| 计费 | 订阅/免费额度（上游 4.2 起公开教材免费、取消书币） | 用户自付 DeepSeek API 费用，本地统计用量 |
| 数据 | 本地学习数据 + 云端账号/云 App/跨机同步 | 纯本地文件系统，不做云同步 |
| 内容 | 官方书城 + 用户导入（PDF/EPUB/DOCX） | 用户自己的 Markdown/文本/PDF/EPUB/Word（均已支持） |
| 社区 | Agora、群聊、分享、愿望单、工坊 | 不做 |
| 更新 | 自动更新（上游 5.1.0） | 手动更新 |
| 语音 | Voice Pack / 录音回放 | 后置，暂不实现 |
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

- [x] Electron 安全壳：main / preload / renderer 分层，`contextIsolation: true`，`nodeIntegration: false`
- [x] DeepSeek 主进程客户端：API Key 安全保存、模型配置、流式 Chat Completions
- [x] 本地文件数据层：profile、world、companions、textbooks、conversations
- [x] 9 角色加载：从 reference 目录导入候选角色并映射到本地世界槽位
- [x] Prompt 组装器：角色、人设、世界观、教材片段、历史窗口、旁白/节奏/语言规则（主进程组装）
- [x] 聊天课堂 UI：角色选择、教材导入、流式回复、Markdown/KaTeX/代码高亮、重试
- [x] 偏好设置：模型、思考深度、教学节奏、旁白开关、主题与字号、回车键位
- [x] 课后产物：summary、flashcards、diary、progress、handoff tail；失败项可单独重试；闪卡可编辑并导出 Markdown/Anki TSV
- [x] 搜索与统计：全库消息搜索、历史课堂、用量与费用统计（可配置单价）
- [x] 课堂增强：教材出处引用（`[教材#N]` + 可核对来源面板）、笔记与四色高亮、划词工具条、消息可编辑
- [x] 本地工具：公式计算器、整课 Markdown 导出、数据备份/恢复、离线帮助与快捷键
- [x] 多格式教材：Markdown / 纯文本 / PDF（逐页提取）/ EPUB（章节目录）/ Word (.docx)，保留原始文件
- [x] 学习进度页：按教材进度条（已知总页数时）、完成课堂、累计 token，一键继续学习
- [x] 自定义角色：创建/编辑/删除，进入角色选择器与课堂 prompt；索引丢失可从 markdown 恢复
- [x] 打包：electron-builder 配置，`release/win-unpacked` 已做真实启动冒烟（读取 `resources/reference`，初始化 9 个角色）

> 进度快照（2026-09-15）：Milestone 0–4 全部完成；上游 3.x–5.x 功能审查的 Batch 1–4 已全部落地（含 PDF/EPUB/DOCX 导入、进度可视化、自定义角色）。
> 质量门禁：`npm test` 569 用例（项目从会话记录恢复后的套件）、`npm run typecheck`、`npm run build`、`npm run test:security`（38 项）、`npm audit`（0 漏洞）全部通过；三条分发产物已构建，并完成真实安装 e2e（安装 → 桌面/开始菜单快捷方式 → 安装版自检 7/7 → 静默卸载 → 用户数据保留）。
>
> 已完成两轮红队对抗审查（并发/数据完整性/资源耗尽/打包/无障碍/安装器），累计发现并修复 40+ 项问题，详见 `docs/产品设计/上游功能审查与建议.md` 的「红队审查结论」。
> 接入真实 API Key 前请先看 [docs/产品设计/接入DeepSeek检查清单.md](docs/产品设计/接入DeepSeek检查清单.md)（含连接测试、费用默认值与出错对照表）。

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
