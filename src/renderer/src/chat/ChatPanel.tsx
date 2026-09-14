import { useEffect, useMemo, useState } from 'react'
import { ChatInput } from './ChatInput'
import { MessageList } from './MessageList'
import { useConversation } from './useConversation'
import { useClassroom } from '../context/ClassroomContext'
import { EndClassButton } from '../artifacts/EndClassButton'
import { CalculatorPanel } from './CalculatorPanel'
import { describeStreamError } from './error-messages'
import type { SelectionAction } from './MessageList'
import type { AppPreferences } from '../../../shared/schemas/preferences'
import type { TextbookMetadata } from '../../../shared/schemas/textbook'
import type { Note, NoteColor } from '../../../shared/schemas/note'
import { ReadingWindow } from './ReadingWindow'

export interface ChatPanelProps {
  companionId: string | null
  companionName?: string | null
  textbookId: string | null
  /** Metadata of the selected textbook (enables the paged reading window). */
  textbookMeta?: TextbookMetadata | null
  /** App preferences controlling model, thinking effort and key bindings. */
  preferences?: AppPreferences
}

/**
 * Streaming classroom chat: transcript + composer + error recovery.
 *
 * The panel only sends classroom context to the main process — prompt
 * assembly (companion, world, textbook, history) happens there.
 */
export function ChatPanel({
  companionId,
  companionName,
  textbookId,
  textbookMeta = null,
  preferences
}: ChatPanelProps): React.ReactElement {
  const conversation = useConversation({
    companionId,
    textbookId,
    model: preferences?.model,
    reasoningEffort: preferences?.reasoningEffort
  })
  const { setConversationId } = useClassroom()
  const [calculatorOpen, setCalculatorOpen] = useState(false)
  const [insertText, setInsertText] = useState<string | null>(null)
  const [notes, setNotes] = useState<Note[]>([])

  // Load notes/highlights for the active conversation (F05).
  useEffect(() => {
    const activeConversationId = conversation.conversationId
    if (activeConversationId === null) {
      setNotes([])
      return
    }
    let cancelled = false
    window.socratopia.notes
      .list(activeConversationId)
      .then((loaded) => {
        if (!cancelled) setNotes(loaded)
      })
      .catch(() => {
        // Notes are auxiliary; a read failure must not block the lesson.
      })
    return () => {
      cancelled = true
    }
  }, [conversation.conversationId])

  const notesByMessage = useMemo(() => {
    const map: Record<string, Note[]> = {}
    for (const note of notes) {
      if (note.messageId === null) continue
      const bucket = map[note.messageId] ?? []
      bucket.push(note)
      map[note.messageId] = bucket
    }
    return map
  }, [notes])

  function handleSelectionAction(action: SelectionAction, text: string): void {
    const quoted = text.replace(/\s+/g, ' ').trim()
    const prefixes: Record<SelectionAction, string> = {
      quote: `> ${quoted}`,
      explain: `请解释这段内容：「${quoted}」`,
      translate: `请翻译这段内容：「${quoted}」`,
      followup: `关于这段内容我想追问：「${quoted}」`
    }
    setInsertText(prefixes[action])
    setCalculatorOpen(false)
  }

  async function createNote(
    messageId: string,
    text: string,
    color: NoteColor
  ): Promise<void> {
    const activeConversationId = conversation.conversationId
    if (activeConversationId === null) return
    const note = await window.socratopia.notes.create({
      conversationId: activeConversationId,
      messageId,
      kind: 'note',
      text,
      color
    })
    setNotes((prev) => [note, ...prev])
  }

  return (
    <section
      aria-label="课堂对话"
      className="flex h-full min-h-0 flex-col bg-[var(--card)]"
    >
      <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--foreground)]">课堂</h2>
          <span className="text-xs text-[var(--muted-foreground)]">
            {companionId !== null && companionName !== null && companionName !== undefined
              ? `与 ${companionName} 对话`
              : '未选择同伴'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCalculatorOpen((open) => !open)}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          >
            计算器
          </button>
          <EndClassButton
            conversationId={conversation.conversationId}
            companionId={companionId}
            textbookId={textbookId}
            disabled={conversation.isStreaming}
            onEnded={() => setConversationId(null)}
          />
        </div>
      </header>

      {textbookMeta !== null && textbookMeta.progress.totalPages !== null && (
        <ReadingWindow
          textbookId={textbookMeta.id}
          title={textbookMeta.title}
          initialPage={textbookMeta.progress.currentPage}
        />
      )}

      {calculatorOpen && (
        <CalculatorPanel
          onInsert={(text) => {
            setInsertText(text)
            setCalculatorOpen(false)
          }}
          onClose={() => setCalculatorOpen(false)}
        />
      )}

      <div className="flex-1 overflow-y-auto p-4">
        <MessageList
          messages={conversation.messages}
          streamingContent={conversation.streamingContent}
          isStreaming={conversation.isStreaming}
          emptyHint={
            companionId === null
              ? '先在左侧选择一位同伴，然后开始提问。'
              : '提出你的第一个问题，同伴会用追问陪你把它想清楚。'
          }
          onEditMessage={
            conversation.isStreaming ? undefined : conversation.editMessage
          }
          notesByMessage={notesByMessage}
          onCreateNote={createNote}
          onSelectionAction={handleSelectionAction}
        />

        {companionId !== null && textbookId === null && (
          <p className="mt-4 rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
            未选择教材：本轮对话不会注入教材内容。
          </p>
        )}

        {conversation.error !== null && (
          <div
            role="alert"
            className="mt-4 flex items-start justify-between gap-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          >
            <span className="space-y-0.5">
              <span className="block font-medium">
                {describeStreamError(conversation.error).title}
              </span>
              <span className="block text-xs">
                {describeStreamError(conversation.error).hint}
              </span>
              {describeStreamError(conversation.error).detail !== null && (
                <span className="block text-xs opacity-70">
                  {describeStreamError(conversation.error).detail}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => void conversation.retry()}
              disabled={!conversation.canRetry}
              className="shrink-0 rounded border border-red-400/50 px-2 py-1 text-xs transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              重试
            </button>
          </div>
        )}
      </div>

      <ChatInput
        insertText={insertText}
        onInsertConsumed={() => setInsertText(null)}
        onSend={(text) => conversation.send(text)}
        onCancel={() => void conversation.cancel()}
        isStreaming={conversation.isStreaming}
        disabled={companionId === null}
        sendOnEnter={preferences?.sendOnEnter ?? true}
        placeholder={
          companionId === null ? '请先选择一位同伴' : '向同伴提问…（Shift+Enter 换行）'
        }
      />
    </section>
  )
}
