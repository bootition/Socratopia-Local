# ADR-003: Start With Electron Desktop App

## Status
Accepted

## Date
2026-07-06

## Context

原 README 计划 Phase 1 先做单角色网页原型，Phase 4 再引入 Electron。用户明确要求“直接开始第二层”。第二层需要本地文件系统、API Key 安全保存和桌面体验。

## Decision

跳过单页网页原型，直接构建 Electron + React + Tailwind 桌面应用。

## Alternatives Considered

### Single HTML / web prototype first
- Pros: 快速验证 prompt 体验。
- Cons: 不能验证安全 Key 存储、本地文件布局和 Electron IPC 边界。
- Rejected: 用户已明确要求直接第二层。

### Tauri
- Pros: 体积更小，安全模型好。
- Cons: 当前参考产品和逆向资料是 Electron/Next.js；项目目标不是探索壳技术。
- Rejected for now: Electron 更贴近参考架构，降低额外不确定性。

## Consequences

- 第一批任务必须包含 Electron 安全基线。
- 所有 DeepSeek 调用和本地存储从 main process 设计。
- UI 可以沿用 Web 技术，但不能假设浏览器环境可直接访问 Key 或文件系统。
