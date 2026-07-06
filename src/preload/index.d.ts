import type { SocratopiaAPI } from './index'

declare global {
  interface Window {
    socratopia: SocratopiaAPI
  }
}
