/**
 * IPC handler for local usage statistics (F15).
 *
 * The renderer only receives aggregates; the raw JSONL log stays in the
 * main process / data directory.
 */

import { ipcMain } from 'electron'
import { STATS_GET } from '../../shared/channel-names'
import type { UsageSummary } from '../../shared/schemas/usage'
import type { UsageStore } from '../settings/usage-store'

export interface RegisterStatsIpcOptions {
  usageStore: UsageStore
}

export function registerStatsIpc(options: RegisterStatsIpcOptions): void {
  ipcMain.handle(STATS_GET, async (): Promise<UsageSummary> => {
    return options.usageStore.summary()
  })
}
