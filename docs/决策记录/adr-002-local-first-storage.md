# ADR-002: Local File Storage From Day One

## Status
Accepted

## Date
2026-07-06

## Context

用户明确要求“本地存储直接一步到位”。旧 README 曾计划网页原型和 localStorage，但当前目标是直接第二层桌面应用。

应用需要持久保存教材、对话、进度、日记、课后总结、闪卡、handoff tail 和角色/世界状态。

## Decision

从第一版开始使用 Electron main process 管理本地文件系统。数据根目录放在 Electron `app.getPath("userData")` 下的 Socratopia-Local 目录。

API Key 使用 `safeStorage` 或 OS keychain 方案加密保存，不放入普通 JSON 文件。

## Alternatives Considered

### localStorage first, later migrate
- Pros: 原型快。
- Cons: 迁移成本高，不适合桌面本地文件和大教材。
- Rejected: 用户明确要求一步到位。

### SQLite first
- Pros: 查询强，适合复杂搜索统计。
- Cons: 当前项目已有 Socratopia 文件布局参考，Markdown/JSON 更透明，便于人工检查和备份。
- Deferred: 如果搜索/统计变复杂，可后续新增索引或 SQLite。

## Consequences

- 初期要先写 storage abstraction 和 schema 校验。
- 数据可手工备份和迁移。
- Renderer 不直接访问文件系统，所有文件读写经 IPC 进入 main process。
