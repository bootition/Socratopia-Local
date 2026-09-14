import { appendFile, readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  UsageRecordSchema,
  type UsageDayBucket,
  type UsageModelBucket,
  type UsageRecord,
  type UsageSummary
} from '../../shared/schemas/usage'
import { configDir } from '../storage/app-data'

/**
 * Append-only local usage log (`config/usage.jsonl`).
 *
 * JSONL keeps writes cheap and makes the file human-inspectable and
 * backup-friendly. Corrupt rows are skipped when aggregating.
 */
export class UsageStore {
  constructor(private readonly dataRoot: string) {}

  private get filePath(): string {
    return join(configDir(this.dataRoot), 'usage.jsonl')
  }

  async record(record: UsageRecord): Promise<void> {
    const validated = UsageRecordSchema.parse(record)
    await mkdir(configDir(this.dataRoot), { recursive: true })
    await appendFile(this.filePath, `${JSON.stringify(validated)}\n`, 'utf-8')
  }

  async list(): Promise<UsageRecord[]> {
    let raw: string
    try {
      raw = await readFile(this.filePath, 'utf-8')
    } catch {
      return []
    }

    const records: UsageRecord[] = []
    for (const line of raw.split('\n')) {
      if (line.trim().length === 0) continue
      try {
        records.push(UsageRecordSchema.parse(JSON.parse(line)))
      } catch {
        // Skip corrupt rows — statistics must never break the app.
      }
    }
    return records
  }

  async summary(): Promise<UsageSummary> {
    const records = await this.list()
    const days = new Map<string, UsageDayBucket>()
    const models = new Map<string, UsageModelBucket>()

    let promptTokens = 0
    let completionTokens = 0
    let totalTokens = 0

    for (const record of records) {
      promptTokens += record.promptTokens
      completionTokens += record.completionTokens
      totalTokens += record.totalTokens

      const date = record.timestamp.slice(0, 10)
      const day = days.get(date) ?? {
        date,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        calls: 0
      }
      day.promptTokens += record.promptTokens
      day.completionTokens += record.completionTokens
      day.totalTokens += record.totalTokens
      day.calls += 1
      days.set(date, day)

      const model = models.get(record.model) ?? {
        model: record.model,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        calls: 0
      }
      model.promptTokens += record.promptTokens
      model.completionTokens += record.completionTokens
      model.totalTokens += record.totalTokens
      model.calls += 1
      models.set(record.model, model)
    }

    return {
      promptTokens,
      completionTokens,
      totalTokens,
      calls: records.length,
      days: [...days.values()].sort((a, b) => (a.date < b.date ? 1 : -1)),
      models: [...models.values()].sort((a, b) => b.totalTokens - a.totalTokens)
    }
  }
}
