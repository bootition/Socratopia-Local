# AGENTS.md — Socratopia-Local 工作约定（必须遵守）

> 本文件是给所有在此仓库工作的 AI agent / 协作者的硬性约定。违反其中任何一条都视为任务未完成。

## 0. 最重要的教训

2026-09-14 发生了两件事：

1. 当天全部功能只做了本地 `git commit`，**从未 `git push`**。GitHub 远端停留在 7 月的里程碑，导致本地工作无法从远端恢复。
2. 一个清理脚本把**项目根目录**当成安装目标执行了递归删除，本地 `.git` 也随之丢失，只能靠会话转录重建。

以下规则就是为了防止这两件事再次发生。

## 1. 交付定义（Definition of Done）

任何一项工作，**只有同时满足以下全部条件才算完成**：

1. `npm test` 全绿（typecheck + 全部单测 + 安全基线）；
2. `npm run build` 通过；涉及打包分发时还要 `npm run dist` 产物 + 一次真实启动冒烟；
3. **已提交并推送到 GitHub**：`git push origin HEAD`；
4. **已用远端验证**：`git ls-remote origin refs/heads/main` 的结果与本地 `git rev-parse HEAD` 一致。

> **只本地 commit 一律不算交付。** 不允许出现「等最后一起推」的流程。

## 2. 推送节奏

- 每完成一个里程碑（一组功能 / 一轮修复 / 一次审查收尾）就推送一次。
- 一个较长任务连续工作超过约 30 分钟，也应至少推送一次可工作的中间状态。
- 推荐直接使用：
  ```bash
  npm run ship          # 跑门禁 → 提交 → 推送 → 验证远端 ref
  npm run ship -- "feat: xxx"   # 指定提交信息
  ```

## 3. Git 约定

- 远端：`origin = https://github.com/bootition/Socratopia-Local.git`
- 主分支：`main`；功能开发用 `feature/<name>` 分支，完成后合回 `main`。
- 提交信息使用英文祈使句（如 `Add PDF import`、`Fix cancel race`）。
- 推送后必须执行一次 `git ls-remote origin` 核对，不能只看 `git push` 的输出。
- 任何情况下都不要 force-push `main`。

## 4. 破坏性操作安全约定

- 执行任何删除 / 覆盖 / 清理命令前，必须：
  1. 打印目标的**绝对路径**；
  2. 确认目标在允许列表内（构建产物目录 `out/`、`release/`、临时恢复目录等）；
  3. **禁止**对项目根目录（或任何包含 `.git` 的目录）执行递归删除；删除前先确认 `.git` 不在目标内。
- 破坏性操作前先 `git status`，必要时先 commit 或 `git stash`，保证可回滚。
- 不修改用户数据目录之外的系统路径；不修改系统级配置。
- 大范围文件操作优先使用 `git`（`git clean -n` 先看）而不是手写递归删除。

## 5. 质量与安全基线

- 不提交密钥、token、真实用户数据；API Key 只允许通过应用界面写入加密存储。
- 渲染进程不得直接访问 Node/fs；所有文件与网络访问留在主进程。
- 新增 IPC 必须有 Zod 校验；新增 store 必须考虑损坏/并发/原子写。
- 修复 bug 必须补回归测试。

## 6. 数据与备份

- 用户数据目录：`%APPDATA%\Socratopia-Local\Socratopia-Local`（升级/卸载不删除）。
- 触及数据目录的开发工作必须使用临时目录，不得动用户的真实数据。
- 发布前确认 `.gitignore` 覆盖 `release/`、`out/`、`node_modules/` 与本地数据。
