import { z } from 'zod'

/**
 * Local token-usage accounting.
 *
 * Every completed stream appends one record to
 * `{dataRoot}/config/usage.jsonl`. Nothing leaves the machine; the
 * renderer only receives aggregates.
 */

export const UsageRecordSchema = z.object({
  timestamp: z.string().datetime({ offset: true }),
  model: z.string().min(1),
  conversationId: z.string().min(1).nullable(),
  promptTokens: z.number().int().min(0),
  completionTokens: z.number().int().min(0),
  totalTokens: z.number().int().min(0)
})

export type UsageRecord = z.infer<typeof UsageRecordSchema>

export interface UsageDayBucket {
  /** Local date, YYYY-MM-DD */
  date: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  calls: number
}

export interface UsageModelBucket {
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  calls: number
}

export interface UsageSummary {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  calls: number
  days: UsageDayBucket[]
  models: UsageModelBucket[]
}
