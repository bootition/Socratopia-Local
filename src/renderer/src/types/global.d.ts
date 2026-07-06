export {}

declare global {
  interface SocratopiaAPI {
    getVersion: () => Promise<string>
    getPlatform: () => Promise<string>
  }

  interface Window {
    socratopia: SocratopiaAPI
  }
}
