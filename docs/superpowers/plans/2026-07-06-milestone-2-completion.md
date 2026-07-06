# Milestone 2 Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or equivalent task-by-task execution with spec review and code-quality review. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Milestone 2 by completing the DeepSeek main-process chat pipeline: real HTTP adapters, streaming SSE adapter, prompt builder, pipeline wiring, and renderer hook foundation.

**Architecture:** Keep all DeepSeek API-key usage in Electron main process. Prompt assembly is pure TypeScript, tested without Electron. HTTP adapters are injected behind existing contracts so unit tests use mocked `fetch`/mock streams and never require a real API key.

**Tech Stack:** Electron main/preload/renderer, React 19, TypeScript, Vitest, Zod, DeepSeek OpenAI-compatible Chat Completions.

---

## Scope

Milestone 2 source of truth is `docs/产品设计/实施计划.md` Tasks 6-8 and Checkpoint B.

Already complete:
- Task 6 client contracts, `DeepSeekClient`, error mapping, mock tests.
- Task 7 streaming session manager, IPC validation, preload chat bridge, security checks.

Remaining:
- Real non-streaming fetch adapter for Task 6 production use.
- Real SSE streaming adapter and replacement of the current placeholder in `src/main/index.ts`.
- Prompt builder: rules, token budget, prompt/message assembly, snapshot tests for Alice/Holmes/Sun Wukong and all-9 role coverage.
- Renderer `useChatStream` hook as the Task 7 renderer-side bridge needed before Milestone 3 UI.
- Checkpoint B verification: mock end-to-end works, prompt readable/compliant, key not exposed.

## File Structure

Create:
- `src/main/llm/deepseek-http-adapter.ts` — production non-streaming `DeepSeekApiAdapter` using `fetch`.
- `src/main/llm/deepseek-stream-adapter.ts` — production `DeepSeekStreamAdapter` using fetch + SSE parsing.
- `src/main/prompt/rules.ts` — Socratic, narration, end-class, page navigation, teaching-language prompt rules.
- `src/main/prompt/token-budget.ts` — rough token estimation, content truncation, history windowing.
- `src/main/prompt/prompt-builder.ts` — pure prompt/message assembly from companion/world/learner/textbook/history/current message.
- `src/renderer/src/chat/useChatStream.ts` — React hook wrapping `window.socratopia.chat`.
- `tests/main/llm/deepseek-http-adapter.test.ts`
- `tests/main/llm/deepseek-stream-adapter.test.ts`
- `tests/main/prompt/rules.test.ts`
- `tests/main/prompt/token-budget.test.ts`
- `tests/main/prompt/prompt-builder.test.ts`
- `tests/main/llm/pipeline-integration.test.ts`
- `tests/renderer/use-chat-stream.test.tsx` or `tests/renderer/use-chat-stream.test.ts`

Modify:
- `src/main/index.ts` — replace placeholder streaming adapter with real adapter.
- `scripts/verify-security.mjs` only if new exposed channels require security checks.

---

## Task 1: DeepSeek non-streaming fetch adapter

**Files:**
- Create: `src/main/llm/deepseek-http-adapter.ts`
- Test: `tests/main/llm/deepseek-http-adapter.test.ts`

- [ ] **Step 1: Write failing tests**
  - Test successful POST sends `Authorization: Bearer <key>`, `Content-Type: application/json`, `model`, `messages`, and no `stream` field.
  - Test non-2xx returns `{ ok: false, status, body }`.
  - Test network errors return a safe `{ ok: false, status: 0 }` body or throw sanitized app error consistent with existing client expectations.
  - Test API key is not present in returned error body/message.

- [ ] **Step 2: Run targeted test and verify RED**
  - Run: `npx vitest run tests/main/llm/deepseek-http-adapter.test.ts`
  - Expected: FAIL because adapter file does not exist.

- [ ] **Step 3: Implement minimal adapter**
  - Export `createDeepSeekHttpAdapter(options?: { endpoint?: string; fetchImpl?: typeof fetch }): DeepSeekApiAdapter`.
  - Default endpoint: `https://api.deepseek.com/v1/chat/completions` unless librarian docs indicate `/chat/completions` under a different base URL.
  - Use injected `fetchImpl` in tests.
  - Never log or return API key.

- [ ] **Step 4: Verify GREEN**
  - Run: `npx vitest run tests/main/llm/deepseek-http-adapter.test.ts`
  - Expected: PASS.

---

## Task 2: DeepSeek SSE streaming adapter

**Files:**
- Create: `src/main/llm/deepseek-stream-adapter.ts`
- Test: `tests/main/llm/deepseek-stream-adapter.test.ts`

- [ ] **Step 1: Write failing tests**
  - Test request body includes `stream: true`.
  - Test SSE `data: {...}\n\n` lines yield parsed `DeepSeekStreamChunk` objects.
  - Test `data: [DONE]` stops iteration.
  - Test malformed JSON emits/throws sanitized stream error without API key.
  - Test non-2xx maps to `mapDeepSeekError` semantics.
  - Test abort signal passed to `fetch` and abort stops iteration.

- [ ] **Step 2: Run targeted test and verify RED**
  - Run: `npx vitest run tests/main/llm/deepseek-stream-adapter.test.ts`
  - Expected: FAIL because adapter file does not exist.

- [ ] **Step 3: Implement minimal streaming adapter**
  - Export `createDeepSeekStreamAdapter(options?: { endpoint?: string; fetchImpl?: typeof fetch }): DeepSeekStreamAdapter`.
  - Parse `ReadableStream<Uint8Array>` with `TextDecoder`.
  - Support multiple lines per chunk and partial buffered lines.
  - Skip empty/comment lines; parse only `data:` lines.
  - Stop on `[DONE]`.
  - Pass `params.signal` to fetch.

- [ ] **Step 4: Verify GREEN**
  - Run: `npx vitest run tests/main/llm/deepseek-stream-adapter.test.ts`
  - Expected: PASS.

---

## Task 3: Prompt rules and token budget

**Files:**
- Create: `src/main/prompt/rules.ts`
- Create: `src/main/prompt/token-budget.ts`
- Test: `tests/main/prompt/rules.test.ts`
- Test: `tests/main/prompt/token-budget.test.ts`

- [ ] **Step 1: Write failing rule tests**
  - Snapshot `getSocraticRules()`, `getNarrationRules()`, `getEndClassRule()`, `getPageNavigationRule()`, `getTeachingLanguageRule('zh')`.
  - Assert narration rules include `*…*`, third-person narration, `**...**`, ≤120 字, and question-ending rule.
  - Assert end-class rule says only learner triggers end class.

- [ ] **Step 2: Write failing token-budget tests**
  - `estimateTokens('') === 0`.
  - Chinese and ASCII mixed text estimates above zero.
  - `truncateToBudget()` leaves short text unchanged.
  - Long text is truncated and includes a clear `[内容已截断]` marker.
  - `windowMessages()` keeps most recent messages while respecting budget.

- [ ] **Step 3: Run targeted tests and verify RED**
  - Run: `npx vitest run tests/main/prompt/rules.test.ts tests/main/prompt/token-budget.test.ts`
  - Expected: FAIL because modules do not exist.

- [ ] **Step 4: Implement rules and budget utilities**
  - Use reference files under `reference/prompt-结构/` as content source.
  - Keep functions pure; no fs/electron imports.

- [ ] **Step 5: Verify GREEN**
  - Run targeted tests again.
  - Expected: PASS.

---

## Task 4: Prompt builder

**Files:**
- Create: `src/main/prompt/prompt-builder.ts`
- Test: `tests/main/prompt/prompt-builder.test.ts`

- [ ] **Step 1: Write failing tests**
  - Snapshot `buildSystemPrompt()` for Alice, Holmes, Sun Wukong using parsed companion metadata.
  - Parameterized test: all 9 companions produce non-empty prompt containing companion name and identity.
  - Test prompt contains Socratic rules, narration rules, end-class rule, Chinese-language rule.
  - Test long textbook content is truncated/windowed.
  - Test `buildMessages()` returns `[system, ...historyTail, user]` and system role only appears at index 0.

- [ ] **Step 2: Run targeted test and verify RED**
  - Run: `npx vitest run tests/main/prompt/prompt-builder.test.ts`
  - Expected: FAIL because builder module does not exist.

- [ ] **Step 3: Implement builder**
  - Export `buildSystemPrompt(params)` and `buildMessages(params)`.
  - Six segments separated by `\n\n---\n\n`: rules, character, world, learner optional, textbook optional, format/end/language rules.
  - Types should reuse `Companion` and `DeepSeekChatMessage`.

- [ ] **Step 4: Verify GREEN**
  - Run targeted prompt tests.
  - Expected: PASS.

---

## Task 5: Pipeline wiring and integration test

**Files:**
- Modify: `src/main/index.ts`
- Test: `tests/main/llm/pipeline-integration.test.ts`

- [ ] **Step 1: Write failing integration tests**
  - Test `buildMessages()` output can feed `StreamChatSession` mock adapter and emits expected tokens.
  - Test system prompt is message index 0.
  - Test missing API key fails before adapter fetch.
  - Test cancel still aborts with prompt-injected messages.

- [ ] **Step 2: Run integration test and verify RED**
  - Run: `npx vitest run tests/main/llm/pipeline-integration.test.ts`
  - Expected: FAIL before wiring/helper exists.

- [ ] **Step 3: Wire real adapter**
  - In `src/main/index.ts`, import `createDeepSeekStreamAdapter()`.
  - Replace placeholder async generator with `streamAdapter.streamChat(params)`.
  - Keep API key read through `keyStore.readKey()` only in main process.

- [ ] **Step 4: Verify GREEN**
  - Run integration test and `npm run test:security`.
  - Expected: PASS; no key exposure.

---

## Task 6: Renderer `useChatStream` hook

**Files:**
- Create: `src/renderer/src/chat/useChatStream.ts`
- Test: `tests/renderer/use-chat-stream.test.tsx` or `tests/renderer/use-chat-stream.test.ts`

- [ ] **Step 1: Write failing hook tests**
  - Test `send()` calls `window.socratopia.chat.startStream()` and subscribes token/error/end/usage.
  - Test token callbacks append assistant content.
  - Test `cancel()` calls `cancelStream(sessionId)` and unsubscribes listeners.
  - Test errors set hook error state.

- [ ] **Step 2: Run targeted test and verify RED**
  - Run: `npx vitest run tests/renderer/use-chat-stream.test.tsx`
  - Expected: FAIL because hook module does not exist.

- [ ] **Step 3: Implement hook**
  - No raw `ipcRenderer` import.
  - Use only `window.socratopia.chat`.
  - Export typed `useChatStream()` and `ChatMessageView` if needed.

- [ ] **Step 4: Verify GREEN**
  - Run targeted hook test and `npm run typecheck:web`.
  - Expected: PASS.

---

## Final Quality Gate

- [ ] Run: `npm test`
- [ ] Run: `npm run build`
- [ ] Run: `npm audit --audit-level=high`
- [ ] Grep for forbidden patterns: `as any|@ts-ignore|@ts-expect-error|getDeepSeekKey|getKey\(|settings:get|settings:read|readKey\(|ipcRenderer\.on\('chat:`
- [ ] Commit remaining work atomically following repo plain-English style.
- [ ] Push `feature/milestone-2-deepseek-pipeline`.
