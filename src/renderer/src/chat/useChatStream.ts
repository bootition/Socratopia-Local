/**
 * Chat stream hook — thin React wrapper over the shared controller.
 *
 * The framework-agnostic controller logic lives in
 * `src/shared/chat-stream-controller.ts`.  This file only provides the
 * React binding (`useChatStream`) and re-exports the shared types and
 * factory for backward compatibility.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createChatStreamController,
  type ChatMessage,
  type ChatRequest,
  type ChatStreamState,
  type StreamError,
  type StreamUsage,
  type CreateChatStreamControllerResult
} from '../../../shared/chat-stream-controller'

// Re-export for backward compatibility
export { createChatStreamController }
export type {
  ChatMessage,
  ChatRequest,
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

  // Leaving the classroom (switching sections) must stop the stream:
  // otherwise tokens keep being billed in the background.
  useEffect(() => {
    return () => {
      void controllerRef.current?.cancel()
    }
  }, [])

  const send = useCallback(
    (request: ChatRequest) => controllerRef.current!.send(request),
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
