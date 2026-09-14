import { z } from 'zod'

/**
 * User-facing application preferences.
 *
 * Stored as `{dataRoot}/config/preferences.json` in plain JSON: these
 * values contain no secrets (the API key lives in its own encrypted
 * file), so they are safe to read/write and to back up.
 */

export const ReasoningEffort = {
  Off: 'off',
  Low: 'low',
  High: 'high',
  Max: 'max'
} as const
export type ReasoningEffort = (typeof ReasoningEffort)[keyof typeof ReasoningEffort]

export const TeachingPace = {
  Slow: 'slow',
  Normal: 'normal',
  Fast: 'fast'
} as const
export type TeachingPace = (typeof TeachingPace)[keyof typeof TeachingPace]

export const FontScale = {
  Small: 'small',
  Normal: 'normal',
  Large: 'large'
} as const
export type FontScale = (typeof FontScale)[keyof typeof FontScale]

export const ThemeMode = {
  Dark: 'dark',
  Light: 'light'
} as const
export type ThemeMode = (typeof ThemeMode)[keyof typeof ThemeMode]

export const ChatModel = {
  Pro: 'deepseek-v4-pro',
  Flash: 'deepseek-v4-flash'
} as const
export type ChatModel = (typeof ChatModel)[keyof typeof ChatModel]

export const AppPreferencesSchema = z.object({
  /** DeepSeek model used for classroom conversation */
  model: z.enum([ChatModel.Pro, ChatModel.Flash]),
  /** Thinking-mode depth: off disables thinking, low/high/max set effort */
  reasoningEffort: z.enum([
    ReasoningEffort.Off,
    ReasoningEffort.Low,
    ReasoningEffort.High,
    ReasoningEffort.Max
  ]),
  /** Teaching pace forwarded to the prompt builder */
  pace: z.enum([TeachingPace.Slow, TeachingPace.Normal, TeachingPace.Fast]),
  /** When false, the companion replies without narration blocks */
  narrationEnabled: z.boolean(),
  /** Enter sends the message; Shift+Enter inserts a newline */
  sendOnEnter: z.boolean(),
  /** Renderer theme */
  theme: z.enum([ThemeMode.Dark, ThemeMode.Light]),
  /** Reading comfort: scales the root font size */
  fontScale: z.enum([FontScale.Small, FontScale.Normal, FontScale.Large]),
  /**
   * Optional DeepSeek pricing used for the local cost estimate
   * (currency-agnostic; 0 disables the estimate in the UI).
   */
  pricePerMillionInput: z.number().min(0).max(100000).default(0),
  pricePerMillionOutput: z.number().min(0).max(100000).default(0)
})

export type AppPreferences = z.infer<typeof AppPreferencesSchema>

export const DEFAULT_PREFERENCES: AppPreferences = {
  model: ChatModel.Pro,
  reasoningEffort: ReasoningEffort.High,
  pace: TeachingPace.Normal,
  narrationEnabled: true,
  sendOnEnter: true,
  theme: ThemeMode.Dark,
  fontScale: FontScale.Normal,
  pricePerMillionInput: 0,
  pricePerMillionOutput: 0
}

/** Partial update accepted by `settings:set-preferences`. */
export const AppPreferencesPatchSchema = AppPreferencesSchema.partial()

export type AppPreferencesPatch = z.infer<typeof AppPreferencesPatchSchema>
