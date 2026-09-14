/**
 * Packaged self-test (no API key required).
 *
 * Runs inside the real Electron main process — including the packaged
 * app with its asar/unpacked resources — and exercises the parts that
 * only break at runtime: PDF parsing (pdf.js), reference corpus loading,
 * textbook page storage, prompt assembly, preferences, usage logging and
 * data backup.
 *
 * Trigger with `SOCRATOPIA_SELF_TEST_OUT=<json path>`; the process writes
 * a report and exits 0 (all checks passed) or 1 (any check failed).
 * It never touches the user's real data directory.
 */

import { access, appendFile, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initDataDir } from '../storage/initialize'
import { resolveReferencePaths } from '../storage/resolve-paths'
import { parseImportFile } from '../textbooks/importers/parse-file'
import {
  createTextbookFromFile,
  getTextbookPage,
  listTextbooks
} from '../textbooks/textbook-store'
import {
  companionDir,
  textbookDir,
  conversationDir,
  storyPath,
  learnerPath
} from '../storage/app-data'
import { createPromptRequestBuilder } from '../prompt/build-request'
import { PreferencesStore } from '../settings/preferences-store'
import { UsageStore } from '../settings/usage-store'
import { exportDataArchive } from '../archive/data-archive'

/** Minimal one-page PDF fixture (same bytes as the test fixture). */
const PDF_BASE64 =
  'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUiA1IDAgUl0gL0NvdW50IDIgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA0IDAgUiA+PiA+PiAvQ29udGVudHMgNiAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9QYWdlIC9QYXJlbnQgMiAwIFIgL01lZGlhQm94IFswIDAgNjEyIDc5Ml0gL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNCAwIFIgPj4gPj4gL0NvbnRlbnRzIDcgMCBSID4+CmVuZG9iago2IDAgb2JqCjw8IC9MZW5ndGggNTMgPj4Kc3RyZWFtCkJUIC9GMSAyNCBUZiA3MiA3MDAgVGQgKEluZXJ0aWEga2VlcHMgbW90aW9uLikgVGogRVQKZW5kc3RyZWFtCmVuZG9iago3IDAgb2JqCjw8IC9MZW5ndGggNTEgPj4Kc3RyZWFtCkJUIC9GMSAyNCBUZiA3MiA3MDAgVGQgKEJ1b3lhbmN5IHB1c2hlcyB1cC4pIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDgKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDEyMSAwMDAwMCBuIAowMDAwMDAwMjQ3IDAwMDAwIG4gCjAwMDAwMDAzMTcgMDAwMDAgbiAKMDAwMDAwMDQ0MyAwMDAwMCBuIAowMDAwMDAwNTQ1IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgOCAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNjQ1CiUlRU9GCg=='

export interface SelfTestCheck {
  name: string
  ok: boolean
  detail: string
  ms: number
}

export interface SelfTestReport {
  ok: boolean
  generatedAt: string
  checks: SelfTestCheck[]
}

async function runCheck(
  checks: SelfTestCheck[],
  name: string,
  task: () => Promise<string>
): Promise<void> {
  const startedAt = Date.now()
  try {
    const detail = await task()
    checks.push({ name, ok: true, detail, ms: Date.now() - startedAt })
  } catch (err: unknown) {
    checks.push({
      name,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      ms: Date.now() - startedAt
    })
  }
}

export async function runSelfTest(
  outPath: string,
  referenceBase: string
): Promise<SelfTestReport> {
  const checks: SelfTestCheck[] = []
  const dataRoot = await mkdtemp(join(tmpdir(), 'socratopia-selftest-'))
  const backupParent = await mkdtemp(join(tmpdir(), 'socratopia-selftest-backup-'))

  try {
    return await runChecks(outPath, referenceBase, dataRoot, backupParent, checks)
  } finally {
    await rm(dataRoot, { recursive: true, force: true }).catch(() => undefined)
    await rm(backupParent, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function runChecks(
  outPath: string,
  referenceBase: string,
  dataRoot: string,
  backupParent: string,
  checks: SelfTestCheck[]
): Promise<SelfTestReport> {
  let { candidatesDir, worldPresetPath } = resolveReferencePaths(referenceBase)
  try {
    await access(candidatesDir)
  } catch {
    // `electron out/main/index.js` makes app.getAppPath() point at
    // out/main; fall back to the working directory for dev self-tests.
    const fallback = resolveReferencePaths(process.cwd())
    candidatesDir = fallback.candidatesDir
    worldPresetPath = fallback.worldPresetPath
  }

  await runCheck(checks, '初始化数据目录与参考角色', async () => {
    const result = await initDataDir({
      dataRoot,
      referenceDir: candidatesDir,
      worldPresetPath
    })
    if (result.companionCount < 1) {
      throw new Error(`reference corpus produced ${result.companionCount} companions`)
    }
    return `${result.companionCount} companions`
  })

  await runCheck(checks, '解析内置 PDF（pdf.js）', async () => {
    const parsed = await parseImportFile(
      'self-test.pdf',
      Buffer.from(PDF_BASE64, 'base64')
    )
    if (parsed.document.text.trim().length === 0) {
      throw new Error('PDF 提取文字为空')
    }
    return `${parsed.document.totalPages ?? '?'} pages, ${parsed.document.text.length} chars`
  })

  let textbookId: string | null = null
  await runCheck(checks, '保存教材并读取分页', async () => {
    const parsed = await parseImportFile(
      'self-test.pdf',
      Buffer.from(PDF_BASE64, 'base64')
    )
    const created = await createTextbookFromFile(textbookDir(dataRoot), {
      worldId: 'world_default',
      title: '自检 PDF',
      format: parsed.format,
      text: parsed.document.text,
      pages: parsed.document.pages,
      totalPages: parsed.document.totalPages,
      originalFileName: 'self-test.pdf'
    })
    textbookId = created.id

    const page = await getTextbookPage(textbookDir(dataRoot), created.id, 1)
    if (page === null || page.text.trim().length === 0) {
      throw new Error('pages.json 无法读回第一页')
    }
    const list = await listTextbooks(textbookDir(dataRoot))
    if (!list.some((book) => book.id === created.id)) {
      throw new Error('教材库中找不到刚保存的教材')
    }
    return `page 1/${page.totalPages}, ${page.text.length} chars`
  })

  await runCheck(checks, '组装课堂 prompt', async () => {
    const companions = JSON.parse(
      await readFile(join(companionDir(dataRoot), 'index.json'), 'utf-8')
    ) as Array<{ id: string }>
    const companion = companions[0]
    if (companion === undefined) throw new Error('没有可用角色')

    const buildRequest = createPromptRequestBuilder({
      companionDir: companionDir(dataRoot),
      textbookDir: textbookDir(dataRoot),
      conversationDir: conversationDir(dataRoot),
      storyPath: storyPath(dataRoot),
      learnerPath: learnerPath(dataRoot)
    })
    const request = await buildRequest({
      companionId: companion.id,
      textbookId,
      conversationId: null,
      userMessage: '什么是惯性？'
    })
    if (request.messages.length === 0) throw new Error('prompt 为空')
    return `${request.messages.length} messages, ${request.sources.length} sources`
  })

  await runCheck(checks, '偏好设置读写', async () => {
    const store = new PreferencesStore(dataRoot)
    await store.update({ model: 'deepseek-v4-flash' })
    await store.update({ reasoningEffort: 'low' })
    const prefs = await store.get()
    if (prefs.model !== 'deepseek-v4-flash' || prefs.reasoningEffort !== 'low') {
      throw new Error('偏好写入未生效')
    }
    return 'model=deepseek-v4-flash, effort=low'
  })

  await runCheck(checks, '用量记录', async () => {
    const store = new UsageStore(dataRoot)
    await store.record({
      timestamp: new Date().toISOString(),
      model: 'deepseek-v4-flash',
      conversationId: null,
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15
    })
    const records = await store.list()
    if (records.length !== 1 || records[0].totalTokens !== 15) {
      throw new Error('用量记录未落盘')
    }
    return '1 record'
  })

  await runCheck(checks, '数据备份导出', async () => {
    const target = await exportDataArchive(dataRoot, backupParent)
    const indexPath = join(companionDir(target), 'index.json')
    const configPath = join(target, 'config', 'preferences.json')
    await stat(indexPath)
    const config = JSON.parse(await readFile(configPath, 'utf-8')) as {
      model?: string
    }
    if (config.model !== 'deepseek-v4-flash') {
      throw new Error('备份中的偏好不匹配')
    }
    const entries = await readdir(target)
    return `${entries.length} entries copied`
  })

  const report: SelfTestReport = {
    ok: checks.every((check) => check.ok),
    generatedAt: new Date().toISOString(),
    checks
  }

  await appendFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
  for (const check of checks) {
    console.log(
      `[self-test] ${check.ok ? 'PASS' : 'FAIL'} ${check.name} (${check.ms}ms) — ${check.detail}`
    )
  }

  return report
}
