/**
 * Result of the DeepSeek connection test.
 *
 * The test makes one tiny non-streaming request so the learner can
 * verify key, network and model before starting a lesson.
 */
export interface DeepSeekKeyTestResult {
  ok: boolean
  /** Model that answered (success only). */
  model?: string
  /** First characters of the reply (success only). */
  reply?: string
  /** Machine-readable failure code (failure only). */
  code?: string
  /** Friendly Chinese message (failure only). */
  message?: string
}
