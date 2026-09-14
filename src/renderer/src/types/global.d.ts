import type { SocratopiaAPI } from '../../../preload/api-types'

declare global {
  interface Window {
    /** The whitelisted main-process bridge (never exposes Node/fs). */
    socratopia: SocratopiaAPI
  }
}

export {}
