# ADR-004: Single-User Personal Tool

## Status
Accepted

## Date
2026-07-06

## Context

Socratopia 是面向公开用户的产品，包含账号、订阅、设备限制、书币、Agora 社区等系统。Socratopia-Local 当前只服务个人自用。

## Decision

第二层只做单用户本地工具。不做账号、登录、多用户、权限、云同步、支付、订阅、设备绑定。

保留 `profiles/default` 文件布局是为了兼容未来迁移，而不是支持多用户 UI。

## Alternatives Considered

### Build profile switching now
- Pros: 更接近 Socratopia。
- Cons: 增加 UI 和数据一致性复杂度。
- Rejected: 当前只有一个使用者。

### Add cloud sync
- Pros: 跨设备可用。
- Cons: 引入后端、认证和隐私问题。
- Rejected: 与本地优先相冲突。

## Consequences

- 产品流程更短：首次启动只需要 API Key 和默认数据初始化。
- 数据模型仍保留 profile/world 层级，但 UI 不暴露多用户管理。
- 不需要权限系统和服务端数据库。
