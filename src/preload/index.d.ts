import type { SocratopiaAPI, StreamErrorData, StreamUsageData } from './api-types'

declare global {
  interface Window {
    /** The whitelisted main-process bridge (never exposes Node/fs). */
    socratopia: SocratopiaAPI
  }
}

export type { StreamErrorData, StreamUsageData }
