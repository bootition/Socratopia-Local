/**
 * Regression test for the packaged self-test entry point.
 *
 * It runs the same checks the packaged app runs, against the repo's
 * reference corpus, so packaging regressions surface in CI too.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { runSelfTest } from '../../../src/main/self-test/run-self-test'

describe('runSelfTest', () => {
  it(
    'passes every check against the repository reference corpus',
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'socratopia-selftest-unit-'))
      const outPath = join(dir, 'report.json')

      try {
        const report = await runSelfTest(outPath, process.cwd())

        expect(report.ok).toBe(true)
        expect(report.checks.map((check) => check.name)).toEqual(
          expect.arrayContaining([
            '初始化数据目录与参考角色',
            '解析内置 PDF（pdf.js）',
            '保存教材并读取分页',
            '组装课堂 prompt',
            '偏好设置读写',
            '用量记录',
            '数据备份导出'
          ])
        )

        const written = JSON.parse(await readFile(outPath, 'utf-8')) as {
          ok: boolean
          checks: Array<{ ok: boolean }>
        }
        expect(written.ok).toBe(true)
        expect(written.checks.every((check) => check.ok)).toBe(true)
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    },
    60_000
  )
})
