import { useCallback, useEffect, useRef, useState } from 'react'
import { useChatStream } from './useChatStream'
import { useClassroom } from '../context/ClassroomContext'
import type { Message } from '../../../shared/schemas/message'
import type { ChatRequest, StreamError } from '../../../shared/chat-stream-controller'

export interface UseConversationOptions {
  companionId: string | null
  textbookId: string | null
  model?: string
  reasoningEffort?: ChatRequest['reasoningEffort']
}

export interface UseConversationResult {
  conversationId: string | null
  messages: Message[]
  /** Assistant draft accumulated while streaming. */
  streamingContent: string
  isStreaming: boolean
  error: StreamError | null
  /** Persist the user message first, then stream the reply. */
  /** Returns false when refused (busy / no companion); draft should be kept. */
  send: (text: string) => boolean
  /** Stop the in-flight stream (partial content is discarded, not persisted). */
  cancel: () => Promise<void>
  /** Re-run the last user message against the existing conversation. */
  retry: () => Promise<void>
  /** Edit a stored message in place (F19). */
  editMessage: (messageId: string, content: string) => Promise<void>
  /** Whether a retry is possible (a user message was sent and we are idle). */
  canRetry: boolean
  /** Non-error notice shown above the composer (e.g. generation stopped). */
  notice: string | null
}

function buildConversationTitle(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  return trimmed.length > 24 ? `${trimmed.slice(0, 24)}…` : trimmed
}

/**
 * Classroom conversation state:
 * - creates the conversation on first send,
 * - appends the user message before streaming (so failures never lose it),
 * - appends the assistant reply once the stream finishes,
 * - reloads messages when the selected conversation changes.
 */
export function useConversation(options: UseConversationOptions): UseConversationResult {
  const { companionId, textbookId, model, reasoningEffort } = options
  const { conversationId, setConversationId } = useClassroom()
  const chat = useChatStream()

  const [messages, setMessages] = useState<Message[]>([])
  const [localError, setLocalError] = useState<StreamError | null>(null)
  // A user-visible note (e.g. "generation stopped") that is not an error.
  const [notice, setNotice] = useState<string | null>(null)
  const lastUserMessageRef = useRef<string | null>(null)
  // Avoid double-sends while a request is being set up.
  const sendingRef = useRef(false)
  // Conversations created by this hook already have their first messages
  // in local state — loading them again would race the append.
  const skipLoadForRef = useRef<string | null>(null)
  // A user message that failed to persist; retry flushes it first so an
  // assistant reply can never end up orphaned in the store.
  const pendingUserRef = useRef<{ conversationId: string; content: string } | null>(null)

  // Load persisted messages whenever the selected conversation changes.
  useEffect(() => {
    if (conversationId === null) {
      setMessages([])
      return
    }

    if (skipLoadForRef.current === conversationId) {
      skipLoadForRef.current = null
      return
    }

    let cancelled = false
    window.socratopia.messages
      .list(conversationId)
      .then((loaded) => {
        if (!cancelled) setMessages(loaded)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLocalError({
            code: 'LOAD_FAILED',
            message: err instanceof Error ? err.message : '无法读取课堂记录'
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [conversationId])

  const runStream = useCallback(
    async (activeConversationId: string, text: string): Promise<void> => {
      if (companionId === null) {
        setLocalError({ code: 'NO_COMPANION', message: '请先选择一位同伴' })
        return
      }

      const result = await chat.send({
        companionId,
        textbookId,
        conversationId: activeConversationId,
        userMessage: text,
        model,
        reasoningEffort
      })

      if (result.cancelled) {
        // Stopping (or leaving the classroom) must not silently throw away
        // what the learner already paid for: keep the partial reply with
        // an explicit marker and offer a one-click regenerate.
        if (result.content.trim().length > 0) {
          try {
            const assistantMessage = await window.socratopia.messages.append({
              conversationId: activeConversationId,
              role: 'assistant',
              content: `${result.content}\n\n（已停止生成，内容未完成）`
            })
            setMessages((prev) => [...prev, assistantMessage])
            setNotice('已停止生成：未完成的内容已保留，可以继续追问或重新生成。')
          } catch {
            setNotice('已停止生成：未完成的内容未能保存。')
          }
        } else {
          setNotice('已停止生成，本条回复没有内容。')
        }
        return
      }

      if (result.content.trim().length > 0) {
        try {
          const assistantMessage = await window.socratopia.messages.append({
            conversationId: activeConversationId,
            role: 'assistant',
            content: result.content,
            ...(result.sources.length > 0 ? { sources: result.sources } : {})
          })
          setMessages((prev) => [...prev, assistantMessage])
        } catch (err: unknown) {
          setLocalError({
            code: 'PERSIST_FAILED',
            message: err instanceof Error ? err.message : '无法保存同伴回复'
          })
        }
      }

      if (result.error !== null) {
        setLocalError(result.error)
      }
    },
    [chat, companionId, textbookId, model, reasoningEffort]
  )

  /**
   * Send returns `false` synchronously when the message was refused
   * (busy / no companion) so the composer can keep the draft instead of
   * silently dropping it.
   */
  const send = useCallback(
    (text: string): boolean => {
      const trimmed = text.trim()
      if (trimmed.length === 0) return false

      if (sendingRef.current || chat.state.isStreaming) {
        setLocalError({
          code: 'BUSY',
          message: '上一条消息还在处理中，请稍候再发送。'
        })
        return false
      }

      if (companionId === null) {
        setLocalError({ code: 'NO_COMPANION', message: '请先选择一位同伴' })
        return false
      }

      sendingRef.current = true
      setLocalError(null)
      setNotice(null)
      lastUserMessageRef.current = trimmed

      void (async () => {
        try {
          let activeConversationId = conversationId

          if (activeConversationId === null) {
            const conversation = await window.socratopia.conversations.create({
              companionId,
              textbookId,
              title: buildConversationTitle(trimmed)
            })
            activeConversationId = conversation.id
            skipLoadForRef.current = conversation.id
            setConversationId(conversation.id)
            setMessages([])
          }

          // Persist the user message BEFORE starting the stream, so a
          // network failure can never lose the learner's question.
          let userMessage: Message
          try {
            userMessage = await window.socratopia.messages.append({
              conversationId: activeConversationId,
              role: 'user',
              content: trimmed
            })
          } catch (err: unknown) {
            pendingUserRef.current = {
              conversationId: activeConversationId,
              content: trimmed
            }
            throw err
          }
          pendingUserRef.current = null
          setMessages((prev) => [...prev, userMessage])

          await runStream(activeConversationId, trimmed)
        } catch (err: unknown) {
          setLocalError({
            code: 'PERSIST_FAILED',
            message: err instanceof Error ? err.message : '无法保存消息'
          })
        } finally {
          sendingRef.current = false
        }
      })()

      return true
    },
    [chat, companionId, textbookId, conversationId, setConversationId, runStream]
  )

  const cancel = useCallback(async (): Promise<void> => {
    await chat.cancel()
  }, [chat])

  const editMessage = useCallback(
    async (messageId: string, content: string): Promise<void> => {
      if (conversationId === null) return
      const updated = await window.socratopia.messages.update({
        conversationId,
        messageId,
        content
      })
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)))
    },
    [conversationId]
  )

  const retry = useCallback(async (): Promise<void> => {
    if (conversationId === null || chat.state.isStreaming || sendingRef.current) return

    // A previously failed user-message append must be flushed first,
    // otherwise the retry would store an orphaned assistant reply.
    const pending = pendingUserRef.current
    if (pending !== null) {
      try {
        const restored = await window.socratopia.messages.append({
          conversationId: pending.conversationId,
          role: 'user',
          content: pending.content
        })
        pendingUserRef.current = null
        setMessages((prev) => [...prev, restored])
        setLocalError(null)
      } catch (err: unknown) {
        setLocalError({
          code: 'PERSIST_FAILED',
          message:
            err instanceof Error
              ? `仍然无法保存你的问题：${err.message}`
              : '仍然无法保存你的问题'
        })
        return
      }
    }

    // Prefer the persisted text: the learner may have edited the
    // message since it was sent.
    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === 'user')
    const text = latestUserMessage?.content ?? lastUserMessageRef.current
    if (text === null) return
    lastUserMessageRef.current = text
    setLocalError(null)
    setNotice(null)
    await runStream(conversationId, text)
  }, [chat, conversationId, messages, runStream])

  const error = localError ?? chat.state.error

  return {
    conversationId,
    messages,
    streamingContent: chat.state.assistantContent,
    isStreaming: chat.state.isStreaming,
    error,
    notice,
    send,
    cancel,
    retry,
    editMessage,
    canRetry:
      lastUserMessageRef.current !== null &&
      conversationId !== null &&
      !chat.state.isStreaming
  }
}
