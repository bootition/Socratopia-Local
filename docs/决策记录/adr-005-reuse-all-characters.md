# ADR-005: Reuse All Nine Character Profiles

## Status
Accepted

## Date
2026-07-06

## Context

本地 `reference/角色设定/candidates/` 已有 9 个角色 Markdown：Alice、Holmes、霍云来、鹿语萌、孟煦、邱灵霓、孙悟空、陶砺、闻莺。用户明确要求复用所有角色内容。

## Decision

第二层从一开始支持全部 9 个角色作为候选角色。初始化本地 default world 时，至少可选择任意一个角色进入课堂；角色内容保持 Markdown 原文，不在初始化阶段重写。

## Alternatives Considered

### Start with Alice only
- Pros: 实现更快。
- Cons: 与用户“复用所有角色内容”要求冲突，也无法验证角色选择和 prompt 泛化。
- Rejected.

### Rewrite characters for IP safety
- Pros: 更适合公开发布。
- Cons: 当前项目只服务个人自用；用户明确要求复用。
- Deferred: 若未来公开发布，应重写角色内容。

## Consequences

- Prompt builder 必须对任意角色 Markdown 稳定工作。
- UI 必须有角色选择器。
- 测试至少覆盖 3 个差异大的角色：Alice、Holmes、孙悟空。
