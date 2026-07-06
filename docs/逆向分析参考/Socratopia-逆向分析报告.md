# Socratopia 逆向分���报告

## 项目背景

**目标**：逆���分析 Socratopia（AI 苏格拉底式角色扮演学习软件），评估其技术架构、订阅保护机制与核心竞争力，并在此基础上开发一个功能等价的本地化 AI 辅助学习工具。

**分析对象**：`D:\Users\qhdjxgm\AppData\Local\Programs\Socratopia\Socratopia.exe`

**分析版本**：v1.0.7 → v2.1.1（更新前后对比）

**分析日期**：2026-06-12

---

## 第一部分：Socratopia 产品全貌

### 1.1 基本信息

| 属性 | 值 |
|---|---|
| 名称 | Socratopia |
| 版本 | v2.1.1 |
| 定位 | Socratic Roleplay Learning — 苏格拉底式角色扮演学习平台 |
| 作者 | Lemin (GitHub: leminwu/socralab-app) |
| 商业模式 | 订阅制（非买断），内置书币商城 |
| 技术栈 | Electron 40 + Next.js 16 + React 19 + Tailwind CSS 4 |
| 体积 | 213MB（含完整 Chromium 运行时） |
| 多 LLM 支持 | OpenAI · Anthropic Claude · Google Gemini · DeepSeek · 通义千问 · Moonshot · MiniMax |
| 语言 | 简体中文 / 繁体中文 / 英文 |

### 1.2 物理组成

```
Socratopia.exe (213MB)
│
├── Electron 壳 (Chromium + V8 + ffmpeg)
│   ├── chrome_100_percent.pak / chrome_200_percent.pak
│   ├── snapshot_blob.bin / v8_context_snapshot.bin
│   ├── ffmpeg.dll / d3dcompiler_47.dll / vulkan-1.dll
│   └── LICENSE.electron.txt
│
├── resources/
│   ├── app.asar (200KB)
│   │   ├── dist-electron/main.js        ← Electron 主进程
│   │   └── dist-electron/preload.js      ← IPC 桥接层
│   │
│   ├── server/                            ← Next.js standalone 服务
│   │   ├── server.js                      ← Node.js 入口
│   │   ├── deps.zip                       ← node_modules 压缩包
│   │   ├── .next/server/app/api/*/route.js  ← 26 个 API 端点
│   │   ├── .next/server/chunks/*.js        ← 14 个 webpack chunk
��   │   ├── public/avatars/                 ← 角色头像 PNG
��   │   ├── public/library/book-index.json  ← 50 本教材索引
│   │   └─��� lib/pdf-worker.mjs              ← PDF 处理 Worker
│   │
│   ├── bundled-content/
│   │   ├── zh/initial_world/
│   │   │   ├── world_preset.md             ← 世界观���事
│   │   │   └── candidates/*.md             ← 9 个角色设定
│   │   ├── en/initial_world/
│   │   └── zh-TW/initial_world/
│   │
│   ├── app-update.yml                      ← 自动更���配置
│   └── elevate.exe                         ← Windows ��限提升
│
└── Uninstall Socratopia.exe
```

### 1.3 功能架构

```
┌─────────────────────────────────────────────┐
│              Electron 壳                      │
│  ┌───────────────────────────────────────┐  │
│  │        Next.js 16 (standalone)         │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │   React 19 前端 (26 个功能模块)  │  │  │
│  │  │   · 聊天界面 (Markdown+KaTeX)    │  │  │
│  │  │   · 9 个 AI 角色选择与管理       │  │  │
│  │  │   · 世界系统 (剧情/关系/日记)    │  │  │
│  │  │   · PDF/EPUB 教材上传与阅读      │  │  │
│  │  │   · 50+ 本教材商城 (书币购买)    │  │  │
│  │  │   · 学习进度追踪 (5 课历史)      │  │  │
│  │  │   · AI 闪卡 / 概念总结 / 课节摘要 │  │  │
│  │  │   · 荣誉等级系统 (6 级 RPG 化)   │  │  │
│  │  │   · 学习统计 (热力图/趋势图)     │  │  │
│  │  │   · 对话历史全文搜索             │  │  │
│  │  │   · 论坛 / 群聊 / 推荐系统       │  │  │
│  │  │   · 语音朗读 (Voice Pack)        │  │  │
│  │  │   · 多档案 (最多 5 个)           │  │  │
│  │  │   · PDF 导出 / 自动更新          │  │  │
│  │  └─────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │   26 个 API Routes               │  │  │
│  │  │          │                        │  │  │
│  │  │          ▼                        │  │  │
│  │  │   ┌─────────────────────┐        │  │  │
│  │  │   │  llm.socratopia.app │ ← 🔒   │  │  │
│  │  │   │   (LLM 代理服务器)    │        │  │  │
│  │  │   │   所有 AI 调用必经     │        │  │  │
│  │  │   └─��───────────────────┘        │  │  │
│  │  └─────────────────────────────────┘  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### 1.4 26 个 API 端点清单

| 端点 | 方法 | 功能 | 依赖后端？ |
|---|---|---|---|
| `/api/account/init` | POST | 账号初始化 | 否（本地） |
| `/api/chat` | POST | **核心 AI 对话** | **是** |
| `/api/system` | GET/POST | 世界系统信息 | 否 |
| `/api/world` | GET/POST/PATCH/DELETE | 世界 CRUD | 否 |
| `/api/conversations` | GET/POST/DELETE | 对话管理 | 否 |
| `/api/textbook` | GET/POST/PATCH/DELETE | 教材 CRUD + 上传 | 否 |
| `/api/reading-context` | GET | 阅读上下文 | 否 |
| `/api/pdf-assets` | GET | PDF 资源 | 否 |
| `/api/jump-page` | GET | 页码跳转 | 否 |
| `/api/profile` | GET/POST/PATCH | 用户档案 | 否 |
| `/api/profile/avatar` | POST | 头像上传 | 否 |
| `/api/profile/reset` | POST | 档案重置 | 否 |
| `/api/companion/avatar` | GET | 角色头像 | 否 |
| `/api/companion/reconcile-persona` | POST | 角色人格调和 | **是** |
| `/api/custom-companions` | GET/POST | 自定义角色 CRUD | 否 |
| `/api/custom-companions/avatar` | GET | 自定义角色头像 | 否 |
| `/api/custom-companions/merge-persona` | POST | 角色人格融合 | **是** |
| `/api/diary` | GET/POST | 学习日记 | 否 |
| `/api/lesson-summary` | GET/POST | AI 课节总结 | **是** |
| `/api/concept-summary` | GET/POST | AI 概念总结 | **是** |
| `/api/flashcard` | GET/POST | AI 闪卡 | **是** |
| `/api/forum` | POST | 论坛 | **是** |
| `/api/groupchat` | POST | 群聊 | **是** |
| `/api/search` | GET | 对话历史搜索 | 否 |
| `/api/stats` | GET | 学习统计 | 否 |
| `/api/test-key` | POST | BYOK 测试 | 生产版返回错误 |

### 1.5 核心依赖

| 依赖 | 用途 |
|---|---|
| `openai` | OpenAI + DeepSeek SDK |
| `@anthropic-ai/sdk` | Claude SDK |
| `@google/generative-ai` | Gemini SDK |
| `pdfjs-dist` | PDF 解析 |
| `epub2` | EPUB 解析 |
| `node-machine-id` | 硬件指纹采集 |
| `electron-store` | 加密本地存储 |
| `electron-updater` | 自动更新 |
| `katex` | 数学公式渲染 |
| `react-markdown` | Markdown 渲染 |
| `jose` | JWT 令牌处理 |
| `remark-cjk-friendly` | CJK 标点优化 |
| `remark-gfm` | GitHub 风格 Markdown |
| `rehype-highlight` | 代码语法高亮 |

### 1.6 9 个 AI 角色

| 角色 | 年龄 | 身份 | 性格关键词 |
|---|---|---|---|
| 爱丽丝 (Alice) | 15 | 化工系大一，少年大学生 | 好奇到底、直觉先行 |
| 福尔摩斯 (Holmes) | 35 | 法医学实验室主任 | 逻辑冷峻、语言精确度洁癖 |
| 霍云来 | 18 | 生物系大一 | 对小生物着迷、注意力向外 |
| 鹿语萌 | 18 | 数学系大一，财团千金 | 表面疏冷毒舌、内心温柔敏感 |
| 孟煦 | 21 | 历史系大三，国象特级大师 | 慵懒通透、温煦如冬日暖阳 |
| 邱灵霓 | 18 | 计算机系大一 | 热烈冒险、对代码有直觉 |
| 孙悟�� | 28 | 清华热能工程系特聘教授 | 桀骜天才、"俺老孙" |
| 陶砺 | 23 | AI 方向博士研究生 | 沉稳儒雅、举重若轻 |
| 闻莺 | 18 | 物理系大一 | 骄傲锐利、嘴硬心软 |

### 1.7 50 本内置教材覆盖领域

计算机科学（8本）、数学（12本）、物理学（5本）、化学（4本）、生物学（4本）、金融/经济（7本）、心理学（6本）、人文/历史/哲学（4本）

---

## 第二部分：订阅保护机制（7 层防护）

### 2.1 核心锁：LLM 代理服务器

```
用户发消息
    │
    ▼
POST /api/chat → Next.js API Route (本地)
    │
    ▼
callLLM({ accessMode, sessionToken, deviceId })
    │
    ▼
chunks/4092.js — resolveLLMConfig()
    │
    ├── accessMode === "hosted" && sessionToken 存在
    ��       │
    │       ▼
    │   https://llm.socratopia.app/v1/chat/completions
    │   Headers: X-Session-Token, X-Device-Id, X-Socratopia-Purpose
    │       │
    │       ▼
    │   后端验证：订阅状态？设备绑定？额度剩余？
    │       │
    │       ���
    │   路由到真实 LLM（OpenAI/Claude/Gemini/DeepSeek...）
    │
    └── 否则：throw Error("BYOK_NOT_AVAILABLE")
```

**关键代码**（chunks/4092.js，编译后）：

```javascript
function resolveLLMConfig(provider, apiKey, accessConfig, forceProvider) {
    if (accessConfig?.accessMode === "hosted" && accessConfig?.sessionToken) {
        let headers = {
            "X-Session-Token": accessConfig.sessionToken,
            "X-Device-Id": accessConfig.deviceId,
            "X-Force-Provider": forceProvider
        };
        return {
            apiKey: "hosted",
            baseURL: "https://llm.socratopia.app/v1",
            extraHeaders: headers,
            isHosted: true
        };
    }
    throw Error("BYOK_NOT_AVAILABLE");
}
```

### 2.2 设备指纹

```javascript
// main.js 行 35688-35705
const { machineIdSync } = require("node-machine-id");
const raw = machineIdSync(true);  // 硬件级唯一标识
cachedDeviceId = crypto.createHash("sha256")
    .update(raw + "socratopia")   // 加盐
    .digest("hex")
    .substring(0, 16);            // 取前 16 字符
```

### 2.3 Session Token 加密��储

使用 Electron `safeStorage` API 加密（Windows DPAPI / macOS Keychain），通过 `electron-store` 读写。

### 2.4 BYOK 编译期剥离

发布版构建命令：`NEXT_PUBLIC_ALLOW_BYOK=false npm run build`

编译后 `/api/test-key` 永远返回 `{"error":"BYOK_NOT_AVAILABLE"}`。

### 2.5 账号系统

`POST /api/account/init` — accountId 格式校验 + 账号数据初始化。

### 2.6 自动更新控制

```yaml
# app-update.yml
provider: generic
url: https://releases.socratopia.app
```

### 2.7 代码混淆

- Electron 代码打包在 `app.asar`（二进制存档）
- Next.js 代码 webpack 编译为 14 个混淆 chunk
- 生产版禁用 DevTools

### 2.8 防护评估总结

| 防护层 | 技术手段 | 目的 | 对复刻的影响 |
|---|---|---|---|
| LLM 代理 | `llm.socratopia.app` | 控制 AI 访问、订阅验证、成本优化 | 复刻时直连 LLM 即可绕过 |
| 设备指纹 | `node-machine-id` + SHA256 | 防止账号共享（3 设备限制） | 不需要 |
| Session Token | `safeStorage` 加密 | 身份验证 | 不需要 |
| BYOK 剥离 | 编译期移除 | 确保没有替代路径 | 我们自己写代码 |
| 账号系统 | 云端 + 本地 | 用户管理 | 不需要 |
| 自动更新 | `electron-updater` | 可随时推送变更 | 不需要 |
| 代码混淆 | ASAR + webpack | 增加逆向成本 | 不影响，我们从零写 |

**核心结论：7 层防护对"从零复刻核心功能"没有阻碍。** 这些防护的目的是确保订阅制可执行，而非防止功能被复制。复刻时我们直连 LLM API，完全绕过了整个代理层。

---

## 第三部分：Q&A

### Q1：Socratopia 到底是什么？

一个 **Electron 桌面壳 + Next.js 本地服务 + 远程 LLM 代理 + 内容商城** 四层架构的订阅制 AI 学习产品。

用户看到的是 9 个 AI 角色在苏格拉底实验室里用追问法引导学习，背后是本地 Next.js 服务协调本地文件系统读写，并将所有 AI 调用转发到 `llm.socratopia.app` 代理服务器。

### Q2：它的订阅制靠什么支撑？

不是靠代码防破解，而是靠**后端对 AI 调用的绝对控制权**。每个 AI 请求携带 Session Token（验证订阅身份）和 Device ID（验证设备绑定），后端根据这两者决定是否放行、走哪个 LLM 供应商、应用什么行为规则。

生产版代码中 `callLLM` 函数只有一个分支：`accessMode === "hosted"` → 代理服务器。即使用户有自己的 API Key，也没有代码路径可以使用它。

### Q3：它的核心竞争力/护城河是什么？

五个层次，从强到弱：

| # | 护城河 | 强度 | 说明 |
|---|---|---|---|
| 1 | `llm.socratopia.app` 后端 | ★★★★★ | 控制 AI 访问的唯一关卡 |
| 2 | 50 本原创教材 | ★★★★ | 内容生产成本远超代码成本 |
| 3 | Prompt Engineering 积累 | ★★★★ | 9 个角色 + 苏格拉底引导法的反复 A/B 测试 |
| 4 | 多供应商 LLM 路由 | ★★★ | 后端自动选择成本最低的 LLM（利润率来源） |
| 5 | 网络效应锁入 | ★★★ | 论坛帖、群聊、学习历史存在云端 |

**最诚实的答案**：护城河 = 原创内容（50 本教材）+ AI 调教（角色 prompt + 苏格拉底引导规则）。代码本身没有壁垒——Electron + Next.js + OpenAI SDK 任何前端工程师都能搭出来。

### Q4：它有防护手段吗？

有完整的 7 层防护，但它们的目的是**确保订阅制可执行**，而���防止功能被复制。核心防护是一个：LLM 代理服务���。其余六层（设备指纹、Session Token、BYOK 剥离、账号系统、自动更新、代码混淆）是它的配套基础设施。

### Q5：能把生产代码改成用自己的 Key 吗？

��术上可以，但需要修改至少三个模块（callLLM 逻辑、前端 accessMode 状态管理、订阅检查/升级弹窗），且每次自动更新会覆盖修改。**从零写 MVP 比逆向破解更快、更干净、更可持续。**

### Q6：不要 SaaS，核心 AI 辅助学习功能能等价吗？

**可以，且范围非常明确。**

可 100% 本地等价的功能：

- AI 苏格拉底式对话（直连 OpenAI/Anthropic/DeepSeek SDK）
- 9 个角色人��（本地 system prompt 文件，直��从 bundled-content 复用）
- PDF/EPUB 教材上传与阅读（pdfjs-dist + epub2 开源）
- 数学公式 + 代码高亮（KaTeX + rehype-highlight）
- 学习进度本地保存（JSON 文件 / localStorage）
- 对话历史全文搜索（Fuse.js 或自写）
- 学习统计 + 热力图（本地数据聚合 + ECharts）
- 课节总结 / AI 闪卡 / 概念总结（直连 LLM + prompt 模板）
- 多档案 + 自定义角色（本地文件系统）

不需要的部分（用我们自己的方案替代）：

- 书币商城 → 用自己的教材文件
- 论坛/群聊 → 不需���
- 推荐系统 → 不需要
- 荣誉系统 → 不需要（纯游戏化留存）
- 语音朗读 → 浏览器内置 TTS 可用，或日后加
- 自动更新 → 手���更新

### Q7：摘代码还是重写？

**重写。** 原因：

1. Socratopia 的代码是 webpack 编译后��� 14 个混淆 chunk，模块之间高度耦合
2. BYOK 路径在编译期被移除，不存在可修改的"开关"
3. 前端逻辑（订阅检查、书币系统、升级弹窗）散落在多个 chunk 中
4. 每次自动更新会覆盖修改

但可以**直接复用**以下内容（它们是纯数据，不需要任何修改）：

- 9 个角色设定 Markdown 文件（42-52 行/个）
- 世界观叙��� Markdown 文件
- 苏格拉底对话 system prompt 模板���构
- 课后更新 prompt 模板
- 文件系统布局设计
- 搜索/统计的数据结构设计

### Q8：我需要做什么？

我们提供的内容：
- LLM API Key（OpenAI / Anthropic / DeepSeek 任意一个）

我们自己要做的：
- 写一个新的 Electron + React + Tailwind 桌面应用
- 直连 LLM SDK（不经过任何代理）
- 本地文件系统存储所有数据
- 实现聊天 UI、角色管理、教材阅读、进度追踪、对话搜索、学习统计

**预计工时**：MVP 2-3 天，完整版 2-3 周（单人）。

---

## 第四部分：复刻计划

### 4.1 技术选型

| 层面 | 技术选择 | 与 Socratopia 的关系 |
|---|---|---|
| 桌面壳 | Electron（同） | 选用相同技术 |
| 前端框架 | React + Tailwind CSS（同） | 选用相同技术 |
| 渲染 | react-markdown + KaTeX + rehype-highlight��同） | 直接使用相同开源库 |
| PDF 解析 | pdfjs-dist（同） | 直接使用��同开源库 |
| EPUB 解析 | epub2（同） | 直接使用相同开源库 |
| LLM 调用 | 直连 OpenAI / Anthropic / DeepSeek SDK | **我们的核心差异**：不经过代理 |
| 数据存储 | 本地文件系统 / localStorage | 更简单、无后端依赖 |
| 搜索 | Fuse.js 或自写 | 轻量替代 |
| 统计图表 | ECharts 或 Recharts | 轻量替代 |

### 4.2 分阶段实施

**第一阶段：MVP（1-2 小时）**

单文件 HTML 页面：
- 1 个 AI 角色（爱丽丝）+ 苏格拉底 system prompt
- 直连 LLM API（流式输出）
- localStorage 保存对话历史
- 不需要安装

目的：立即验证核心体验。

**第二阶段：桌面应用（2-3 天）**

Electron + React + Tailwind：
- 完整聊天界面（Markdown + 流式 + KaTeX）
- 9 个角色全��接入
- PDF/EPUB 上传与阅读
- 本地文件持久化（进度、日记、对话历史）
- 对话搜索

**第三阶段：打磨（1-2 周）**

- 课后 AI 摘要生成
- 学习统计仪表盘
- 自定义角色创建
- UI 打磨

### 4.3 可直接复用的资源清单

```
Socratopia 原始文件                              → 我们的用途
──────────────────────────────────────────────────────────────────
bundled-content/zh/initial_world/world_preset.md  → 世界观 story 文本
bundled-content/zh/initial_world/candidates/*.md  → 9 个角色 system prompt
server/public/avatars/*.png                       → 角色头像（如需）
.app/api/chat/route.js 中的 prompt 模板           → 苏格拉底引导 prompt 结构
.app/api/chat/route.js 中的课后更新 prompt        → FAREWELL/PROGRESS/DIARY 格式
.app/server/chunks/40969.js 中的文件布局          → 本地文件目录结构设计
.app/server/chunks/354.js/4137.js 的 i18n 字符串  → UI 文字参考
```

### 4.4 与 Socratopia 的差异

| 方面 | Socratopia | 我们的版本 |
|---|---|---|
| LLM 调用 | 经过 llm.socratopia.app 代理 | 直连 LLM SDK |
| 计费 | 订阅 + 书币商城 | 用户自付 API 费用 |
| 内容 | 50 本内置教材（云端） | 用户自己的 PDF/EPUB |
| 数据 | 混合本地+云端 | 纯本地 |
| 社区 | 论坛、群聊、推荐 | 无 |
| 更新 | 自动更新 | 手动 |
| 设备限制 | 3 台 | 无 |
| 语音 | Voice Pack 订阅 | 可选浏览器 TTS |

---

## 第五部分：原始逆向数据附录

### A. LLM 代理锁定代码（完整）

文件：`resources/server/.next/server/chunks/4092.js`（模块 64092）

```javascript
// 默认模型配置
let defaults = {
    anthropic: "claude-sonnet-4-20250514",
    openai: "gpt-4o-mini",
    gemini: "gemini-2.5-flash",
    deepseek: "deepseek-v4-flash",
    qwen: "qwen-plus",
    moonshot: "moonshot-v1-auto",
    minimax: "MiniMax-M2.7-highspeed"
};

let proxyUrl = process.env.SOCRATOPIA_PROXY_URL || "https://llm.socratopia.app/v1";

// 配置解析 - 生产版只有 hosted 路径
function resolveLLMConfig(provider, apiKey, accessConfig, forceProvider) {
    if (accessConfig?.accessMode === "hosted" && accessConfig?.sessionToken) {
        let headers = {"X-Session-Token": accessConfig.sessionToken};
        if (accessConfig.deviceId) headers["X-Device-Id"] = accessConfig.deviceId;
        if (forceProvider) headers["X-Force-Provider"] = forceProvider;
        return {apiKey: "hosted", baseURL: proxyUrl, extraHeaders: headers, isHosted: true};
    }
    throw Error("BYOK_NOT_AVAILABLE");
}

// LLM 调用
async function callLLM({provider, apiKey, model, systemPrompt, messages,
    maxTokens=4096, timeoutMs=90000, hosted, forceProvider,
    stripThink=true, thinking, purpose, noFallback, responseFormat}) {

    let config = resolveLLMConfig(provider, apiKey, hosted, forceProvider);
    if (config.isHosted && purpose)
        config.extraHeaders["X-Socratopia-Purpose"] = purpose;
    if (config.isHosted && noFallback)
        config.extraHeaders["X-No-Fallback"] = "true";

    let controller = new AbortController();
    let timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        let base = config.baseURL || "";
        let response = await fetch(`${base}/chat/completions`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                "Content-Type": "application/json",
                ...config.extraHeaders
            },
            body: JSON.stringify({
                model, max_tokens: maxTokens, stream: false,
                messages: [{role: "system", content: systemPrompt},
                    ...messages.map(m => ({role: m.role, content: m.content}))],
                ...(thinking !== undefined && (model === "deepseek-chat" ||
                    model.startsWith("deepseek-v4")) ?
                    {thinking: {type: thinking ? "enabled" : "disabled"}} : {}),
                ...(responseFormat === "json_object" ?
                    {response_format: {type: "json_object"}} : {})
            }),
            signal: controller.signal
        });
        let data = await response.json();
        let content = data.choices?.[0]?.message?.content || "";
        return stripThink && content ?
            content.replace(/<think>[\s\S]*?<\/think>\s*/g, "") : content;
    } finally {
        clearTimeout(timer);
    }
}
```

### B. 规则引擎（/rules 端点）

文件：`resources/server/.next/server/app/api/chat/route.js`（模块 7788）

- 规则 URL：`https://llm.socratopia.app/rules?lang={en|zh|zh-TW}&noEnd=1`
- 认证：`X-Session-Token` header
- 缓存：成功缓存 1 小时，失败缓存 30 秒（按 auth/network/server 分类���级）
- 401 → auth 失败；500+ → 临时错误；其他 → 永久错误

### C. 设备指纹代码（完整）

文件：`app.asar/dist-electron/main.js`（行 35688-35705）

```javascript
let cachedDeviceId = null;

ipcMain.handle("device:getId", async () => {
    if (cachedDeviceId) return cachedDeviceId;
    try {
        const { machineIdSync } = await import("node-machine-id");
        const raw = machineIdSync(true);
        if (!raw || raw.length < 8 || /^0+$/.test(raw))
            throw new Error("bad machine id");
        cachedDeviceId = crypto.createHash("sha256")
            .update(raw + "socratopia")
            .digest("hex")
            .substring(0, 16);
    } catch {
        const storePath = path.join(app.getPath("userData"), "device-id-fallback");
        try {
            cachedDeviceId = fs.readFileSync(storePath, "utf-8").trim();
        } catch {
            cachedDeviceId = crypto.randomBytes(8).toString("hex");
            fs.writeFileSync(storePath, cachedDeviceId, "utf-8");
        }
    }
    return cachedDeviceId;
});
```

### D. 苏格拉底对话 System Prompt 结构

从 chat/route.js 提取的 system prompt 组装顺序：

1. 角色设定（姓名 + 人格描述）
2. 当前关系状态
3. 世界背景
4. 相处片段（pal_moments，近期互动记忆）
5. 学习者信息
6. 上次学习日期 / 当前状态��新世界初次见面提示）
7. 群聊最近消息（如有）
8. 当前教材（本次教学对象）
9. 教材库一览
10. 学习进度（当前教材）
11. 当前教材内容（本节课已读取）
12. 本节课提纲
13. 前序对话摘要（长对话压缩）
14. 伙伴精力状态（5 级疲态触发）
15. 页面导航规则
16. 旁白与强调格式规则
17. 每条消息必须包含旁白 + 以提问结尾
18. 下课铁律（只能由学习者点击按钮触发）

### E. v1.0.7 → v2.1.1 变更清单

| 变更 | 详情 |
|---|---|
| 版本号 | 1.0.7 → 2.1.1 |
| 新增 API | `/api/search`（对话搜索）、`/api/stats`（学习统计） |
| 新增功能 | 语音对话 (Voice Pack)、荣誉等级系统 (Honor Level) |
| 新增文件 | `pal_moments.md`（替代 story.md 作为课堂互动记录） |
| 新依赖 | `remark-cjk-friendly`（CJK 标点优化） |
| LLM 增强 | `X-No-Fallback` header、`[callLLM-DIAG]` 诊断日志 |
| 规则引擎 | 错误分类优化（auth/network/server 三种降级策略） |
| prompt 增强 | "第一铁律"反幻觉规则、旁白第三人称强制规范 |
| 构建优化 | `predev`/`prebuild` Katex CSS 内联 |

### F. i18n 关键字符串（订阅/书币相关）

```
account.typeFree           "Free Account" / "免费账户"
account.typePlan           "Live-In Tutor" / "住师订户"
account.typeFriend         "Founding Friend" / "创院之友"
account.deviceNote         "Each account can be used on up to 3 devices."
payment.tokenPlan          "Live-In Tutor Subscription"
payment.autoRenew          "Your subscription auto-renews on expiry."
payment.buyCredits         "Buy Credits" / "购买书币"
payment.cancelSubscription "Cancel Subscription"
library.credits            "{count} credits" / "{count} 书币"
library.purchase           "Purchase" / "购买"
library.confirmPurchase.insufficient "Insufficient credits"
family.libraryCreditsLabel "Library Credits" / "书币"
family.claimCredits        "Claim 10 Credits" / "领��� 10 书币"
family.claimCreditsLocked  "Claim 10 Credits (subscribe)" / "领取 10 书币（需订阅）"
```

---

## 附录：文件索引

| 源文件 | 用途 |
|---|---|
| `resources/server/package.json` | 版本号 + 依赖清单 + 构建命令 |
| `resources/app.asar` | Electron 主进程 + preload |
| `resources/server/.next/server/app/api/*/route.js` | 26 个 API 端点 |
| `resources/server/.next/server/chunks/4092.js` | callLLM 核心模块 |
| `resources/server/.next/server/chunks/354.js` | 简体中文 i18n |
| `resources/server/.next/server/chunks/4137.js` | 英文 i18n |
| `resources/server/.next/server/chunks/8214.js` | 繁体中文 i18n |
| `resources/server/.next/server/chunks/40969.js` | 文件系统布局 |
| `resources/bundled-content/zh/initial_world/` | 世界观 + 9 个角色设定 |
| `resources/server/public/library/book-index.json` | 50 本教材索引 |
| `resources/app-update.yml` | 自动更新配置 |
