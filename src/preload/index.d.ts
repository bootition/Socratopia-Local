import type { SocratopiaAPI, StreamErrorData, StreamUsageData } from './index'

declare global {
  interface Window {
    socratopia: SocratopiaAPI
  }
}

export type { StreamErrorData, StreamUsageData }
