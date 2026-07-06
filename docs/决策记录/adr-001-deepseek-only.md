# ADR-001: DeepSeek API Only

## Status
Accepted

## Date
2026-07-06

## Context

Socratopia-Local 是单用户个人工具，目标是尽快复刻核心学习体验，而不是构建通用多模型平台。原报告列出 OpenAI、Anthropic、Gemini、DeepSeek 等多供应商，但用户明确指定 API 选择 DeepSeek。

DeepSeek 提供 OpenAI-compatible Chat Completions API，适合主进程中用标准 SDK 封装。

## Decision

第二层只支持 DeepSeek API。默认课堂模型使用 `deepseek-v4-pro`，轻量摘要/闪卡可使用 `deepseek-v4-flash`。

不在第二层实现多 LLM provider 抽象层。

## Alternatives Considered

### Multi-provider from start
- Pros: 更灵活，便于模型切换。
- Cons: 抽象层、配置、错误处理和 UI 都会变复杂。
- Rejected: 与“个人自用、快速做出核心闭环”目标冲突。

### OpenAI only
- Pros: SDK 和生态成熟。
- Cons: 用户已明确选择 DeepSeek。
- Rejected: 不符合当前锁定决策。

## Consequences

- 实现更简单，计划更集中。
- DeepSeek 错误码、streaming、thinking mode 成为核心契约。
- 未来如需扩展 provider，应写新 ADR，而不是在当前第二层提前抽象。
