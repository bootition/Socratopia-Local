export {}

declare global {
  interface ChatAPI {
    startStream: (
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
      model?: string
    ) => Promise<string>
    cancelStream: (sessionId: string) => Promise<void>
    onToken: (sessionId: string, callback: (token: string) => void) => () => void
    onError: (sessionId: string, callback: (error: { code: string; message: string }) => void) => () => void
    onEnd: (sessionId: string, callback: (finishReason: string) => void) => () => void
    onUsage: (sessionId: string, callback: (usage: { promptTokens: number; completionTokens: number; totalTokens: number }) => void) => () => void
  }

  interface SettingsAPI {
    hasDeepSeekKey: () => Promise<boolean>
    setDeepSeekKey: (key: string) => Promise<void>
    deleteDeepSeekKey: () => Promise<void>
  }

  interface SocratopiaAPI {
    getVersion: () => Promise<string>
    getPlatform: () => Promise<string>
    settings: SettingsAPI
    chat: ChatAPI
  }

  interface Window {
    socratopia: SocratopiaAPI
  }
}
