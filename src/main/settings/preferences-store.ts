import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  AppPreferencesSchema,
  DEFAULT_PREFERENCES,
  type AppPreferences,
  type AppPreferencesPatch
} from '../../shared/schemas/preferences'
import { configDir } from '../storage/app-data'

/**
 * Plain-JSON application preferences store.
 *
 * Read path is forgiving: a missing file, invalid JSON or a partially
 * invalid object falls back to defaults per field, so a hand-edited
 * file can never prevent the app from starting.
 */
export class PreferencesStore {
  /** Serializes read-modify-write updates so concurrent patches can't drop fields. */
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly dataRoot: string) {}

  private get filePath(): string {
    return join(configDir(this.dataRoot), 'preferences.json')
  }

  async get(): Promise<AppPreferences> {
    let raw: unknown
    try {
      raw = JSON.parse(await readFile(this.filePath, 'utf-8'))
    } catch {
      return { ...DEFAULT_PREFERENCES }
    }

    const parsed = AppPreferencesSchema.safeParse(raw)
    if (parsed.success) {
      return parsed.data
    }

    // Field-level fallback: keep whatever validates, default the rest.
    const result = { ...DEFAULT_PREFERENCES }
    const source = (raw ?? {}) as Record<string, unknown>
    for (const key of Object.keys(AppPreferencesSchema.shape) as Array<keyof AppPreferences>) {
      const field = AppPreferencesSchema.shape[key].safeParse(source[key])
      if (field.success) {
        result[key] = field.data as never
      }
    }
    return result
  }

  update(patch: AppPreferencesPatch): Promise<AppPreferences> {
    const run = async (): Promise<AppPreferences> => {
      const current = await this.get()
      const merged = { ...current, ...patch }
      const validated = AppPreferencesSchema.parse(merged)

      await mkdir(configDir(this.dataRoot), { recursive: true })
      await writeFile(this.filePath, JSON.stringify(validated, null, 2), 'utf-8')
      return validated
    }

    const next = this.queue.then(run, run)
    this.queue = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }
}
