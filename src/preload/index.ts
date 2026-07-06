import { contextBridge, ipcRenderer } from 'electron'

export interface SettingsAPI {
  /** Check whether a DeepSeek API key has been configured */
  hasDeepSeekKey: () => Promise<boolean>
  /** Save a DeepSeek API key (encrypted on disk) */
  setDeepSeekKey: (key: string) => Promise<void>
  /** Remove the stored DeepSeek API key */
  deleteDeepSeekKey: () => Promise<void>
}

export interface SocratopiaAPI {
  /** Retrieve the application version string */
  getVersion: () => Promise<string>
  /** Retrieve the current OS platform identifier */
  getPlatform: () => Promise<string>
  /** Settings operations (API key management) */
  settings: SettingsAPI
}

const socratopia: SocratopiaAPI = {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),
  settings: {
    hasDeepSeekKey: () => ipcRenderer.invoke('settings:has-deepseek-key'),
    setDeepSeekKey: (key: string) => ipcRenderer.invoke('settings:set-deepseek-key', { key }),
    deleteDeepSeekKey: () => ipcRenderer.invoke('settings:delete-deepseek-key')
  }
}

contextBridge.exposeInMainWorld('socratopia', socratopia)
