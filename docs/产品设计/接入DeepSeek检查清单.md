# 接入 DeepSeek API Key 检查清单

日期：2026-09-14
适用版本：Socratopia-Local（`release/win-unpacked` 或 `npm run dev`）

本文档回答一个问题：**在填入真实 DeepSeek API Key 之前，还需要确认什么。**

---

## 一、接入前的就绪状态（本次已完成）

| 项目 | 状态 | 说明 |
|---|---|---|
| Key 存储 | ✅ | Windows DPAPI（`safeStorage`）加密写入 `config/deepseek-key.enc`，渲染器只能拿到 `hasKey: boolean` |
| 请求字段核对 | ✅ | 对照官方 API 文档：`model` = `deepseek-v4-pro` / `deepseek-v4-flash`；`stream: true` + `stream_options.include_usage: true`；`thinking: { type: 'enabled' \| 'disabled' }`；`reasoning_effort` 为 `low/high/max`（关闭走在 `thinking.disabled`）。与参考实现（Socratopia v2.1.1 server bundle）一致 |
- 只要还在出 token，就不会被腰斩（已移除 15 分钟总时长上限，只保留「5 分钟无任何新内容」的空闲超时）。
| 非流式超时 | ✅ | 课后产物的非流式调用有 120 秒上限，不会永久转圈 |
| 连接测试 | ✅ | 首启页新增「测试连接（不保存）」：用未保存的 Key 发一条 `max_tokens=16` 的极小请求；设置页也可用已保存 Key 测试 |
| 错误可读性 | ✅ | 401 → 提示重新填 Key；402 → 余额不足；429 → 限流稍后重试；网络失败 → 中文说明；原始服务端消息作为次要详情保留 |
| 用量统计 | ✅ | 每次流式回复的 usage 落 `config/usage.jsonl`，Stats 页显示 token 与（填单价后）估算费用 |
| 质量门禁 | ✅ | typecheck、**569 单测 / 54 文件**、安全基线 38 项、build、打包自检 7/7、真实安装 e2e 全部通过；`npm audit` 0 漏洞 |

**结论：可以接 Key 了。** 唯一无法在离线环境验证的是真实网络下的端到端请求（下面第三步就是用它做验证）。

---

## 二、建议的接入顺序

1. **启动应用**：`release/win-unpacked/Socratopia-Local.exe`（或 `npm run dev`）。
2. **粘贴 Key** → 先点 **「测试连接（不保存）」**：
   - 成功会显示 `连接成功：模型 deepseek-v4-pro 已响应`；
   - 失败会给出可操作原因（Key 无效 / 余额不足 / 网络 / 模型）。
3. 确认无误后点 **「保存并进入课堂」**。
4. 到 **Settings** 里按需调整：
   - 模型：先用 `deepseek-v4-flash` 试跑（更快更省），需要深度推理再切 `deepseek-v4-pro`；
   - 思考深度：默认 `high`；想省钱可设 `low` 或 `off`；
   - 教学节奏、旁白、字号、回车键位；
   - 若要费用估算，填 DeepSeek 当前的每百万 token 单价。
5. **上一节课**：Companion 选角色 → Textbook 导入（可先用 Markdown 文本）→ Classroom 提问。
6. **点「下课」**：确认后检查总结、闪卡、日记、进度、接力产物；失败项可单独重试。
7. 到 **History** 回看/导出，**Progress** 看进度，**Stats** 看 token 消耗。

---

## 三、费用与默认值（心里有数）

- 默认模型 `deepseek-v4-pro` + thinking `high`；官方默认输出上限：**非思考 8K tokens、思考 64K、`max_tokens` 调大后最多 128K**。
- 一节典型课堂（几轮追问 + 一次下课整理）通常几万 token 量级；首次建议用 flash + `low` 跑通，再按需升档。
- 每次回复的 usage 都会记录在 **Stats**；填了单价才会显示估算费用（不填只显示 token）。
- 导入教材本身不花钱（解析全在本地）；引用检索也是本地关键词匹配。

---

## 四、出错对照表

| 现象 | 原因 | 处理 |
|---|---|---|
| 测试连接提示「API Key 无效或已过期」 | Key 错/被删/复制时带了空格 | 重新粘贴，注意不要带换行 |
| 提示「DeepSeek 余额不足」 | 账户欠费 | 到 DeepSeek 平台充值 |
| 提示「请求过于频繁」 | 触发限流 | 等几秒重试；不要连点发送 |
| 提示「网络连接失败」 | 本机网络/代理问题 | 检查网络；公司代理需让系统代理生效 |
| 提示「请求被 DeepSeek 拒绝」 | 模型名或参数不被接受 | 设置里换回 `deepseek-v4-pro` / `deepseek-v4-flash` |
| 导入 PDF 报「没有可提取的文字」 | 扫描件/纯图片 PDF | 需要 OCR，当前不支持；先用文本或 DOCX |
| 打包版 PDF 导入异常 | pdf.js worker 未随包生效 | 用 `npm run dev` 对照确认；打包版资源已 `asarUnpack`，如仍失败可先用 Markdown/文本 |

---

## 五、当前已知限制（不影响接 Key）

- 不支持 OCR（扫描版 PDF）、语音朗读/回放、云同步、书城/社区（与既定范围一致）。
- `pages.json` 已在下课时由 `getTextbookPage` 读取并写回 `textbook.json` 的 `progress`（Progress 页/教材库/PDF 阅读窗口都读它）。
- DOCX 解压总量只受 100MB 输入上限约束，异常超大压缩比文档仍可能占用较多内存。
- 打包版已配置应用图标（`build/icon.png`），但**未做代码签名**：Windows 可能提示「未知发布者」，点「更多信息 → 仍要运行」即可；卸载保留用户数据。

---

## 六、本次验证记录

- `npm test`：**569 用例 / 54 文件全过**（项目从会话记录恢复后的套件；原始 843 用例中的部分文件未被转录完整捕获，已按模块重建）
- `npm run typecheck`、`npm run build`：通过
- `npm run test:security`：38 项通过
- `npm audit`：0 漏洞
- 打包：`electron-builder --dir` 成功；packaged 应用启动冒烟初始化 9 个角色；pdf.js 从 `app.asar.unpacked` 实测可解析 PDF；单实例锁实测第二个实例立即退出
