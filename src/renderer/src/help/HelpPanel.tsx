/**
 * Offline help & quick reference (F32).
 *
 * Static content only: everything the learner needs to know about the
 * local workflow, shortcuts, data location and the current feature set.
 */

const SHORTCUTS: Array<[string, string]> = [
  ['Ctrl/Cmd + 1', '设置'],
  ['Ctrl/Cmd + 2', '选择同伴'],
  ['Ctrl/Cmd + 3', '导入教材'],
  ['Ctrl/Cmd + 4', '课堂'],
  ['Ctrl/Cmd + 5', '历史课堂'],
  ['Ctrl/Cmd + 6', '课堂笔记'],
  ['Ctrl/Cmd + 7', '用量与费用'],
  ['Ctrl/Cmd + K', '跳到历史搜索'],
  ['Enter', '发送消息（可在设置里改为换行）'],
  ['Shift + Enter', '输入换行'],
  ['Ctrl/Cmd + Enter', '发送消息（Enter 换行模式下）']
]

const WORKFLOW: string[] = [
  '在「Companion」里选一位同伴。',
  '在「Textbook」里粘贴 Markdown/纯文本，或上传 .md / .txt 文件。',
  '回到「Classroom」提问；同伴会用苏格拉底式追问陪你往下想。',
  '对话中可划词「引用 / 解释 / 翻译 / 追问」，可在消息旁「记笔记」。',
  '点「下课」确认后，会生成总结、闪卡、日记、进度和接力内容；失败的部分可以单独重试。',
  '在「History」里回看旧课堂、搜索消息、导出课程 Markdown；在「Notes」里管理全部笔记。'
]

const FEATURES: string[] = [
  'API Key 连接测试（填入后先验证 Key / 网络 / 模型）',
  '角色化 AI 课堂，9 个内置角色',
  'Markdown / 纯文本教材导入，段落级教材引用可核对原文',
  '流式回复、Markdown/KaTeX/代码渲染、失败重试不丢消息',
  '课堂笔记与四色高亮、划词工具条、消息可编辑',
  '课后产物：总结 / 闪卡 / 日记 / 进度 / 接力；闪卡可编辑并导出 Markdown、Anki TSV',
  '历史课堂与全库消息搜索、整课 Markdown 导出',
  '本地公式计算器（离线、不消耗 token）',
  '用量与费用统计（token + 可配置单价估算）',
  '本地数据备份/恢复、打开数据目录',
  '偏好设置：模型、思考深度、教学节奏、旁白开关、主题与字号、回车键位'
]

export function HelpPanel(): React.ReactElement {
  return (
    <section aria-label="帮助" className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">帮助与速查</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Socratopia-Local 完全离线运行（除 DeepSeek API 外不联网），以下内容随时可查。
        </p>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">第一节课怎么上</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[var(--muted-foreground)]">
          {WORKFLOW.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">快捷键</h3>
        <dl className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
          {SHORTCUTS.map(([keys, action]) => (
            <div key={keys} className="flex items-center justify-between gap-3">
              <dt className="font-mono text-xs text-[var(--foreground)]">{keys}</dt>
              <dd className="text-[var(--muted-foreground)]">{action}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">已实现的功能</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--muted-foreground)]">
          {FEATURES.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">数据与隐私</h3>
        <ul className="mt-2 space-y-1 text-sm text-[var(--muted-foreground)]">
          <li>API Key 由主进程加密保存，渲染器永远拿不到明文。</li>
          <li>
            课堂、教材、笔记、产物与用量都保存在本机数据目录；可在设置页「导出备份」整目录复制。
          </li>
          <li>删除 API Key 只会回到配置界面，不会删除学习数据。</li>
          <li>只有 DeepSeek 请求会联网；搜索、计算器、导出全部在本地完成。</li>
        </ul>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">暂不支持</h3>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          PDF/EPUB/DOCX 导入、语音朗读、云同步、社区与商城。上游对应功能见
          `docs/产品设计/上游功能审查与建议.md` 的排除清单。
        </p>
      </div>
    </section>
  )
}
