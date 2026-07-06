/**
 * Chat stream hook — thin React wrapper over the shared controller.
 *
 * The framework-agnostic controller logic lives in
 * `src/shared/chat-stream-controller.ts`.  This file only provides the
 * React binding (`useChatStream`) and re-exports the shared types and
 * factory for backward compatibility.
 */

import { useCallback, useRef, useState } from 'react'
import {
  createChatStreamController,
  type ChatMessage,
  type ChatStreamState,
  type StreamError,
  type StreamUsage,
  type CreateChatStreamControllerResult
} from '../../../shared/chat-stream-controller'

// Re-export for backward compatibility
export { createChatStreamController }
export type {
  ChatMessage,
  ChatStreamState,
  StreamError,
  StreamUsage,
  CreateChatStreamControllerResult
}

// --------------- React hook ---------------

export function useChatStream(): CreateChatStreamControllerResult {
  const [, setTick] = useState(0)
  const controllerRef = useRef<CreateChatStreamControllerResult | null>(null)

  if (controllerRef.current === null) {
    const api = window.socratopia.chat
    controllerRef.current = createChatStreamController(api, () => {
      setTick((n) => n + 1)
    })
  }

  const send = useCallback(
    (messages: ChatMessage[], model?: string) =>
      controllerRef.current!.send(messages, model),
    []
  )

  const cancel = useCallback(() => controllerRef.current!.cancel(), [])

  return {
    get state() {
      return controllerRef.current!.state
    },
    send,
    cancel
  }
}
