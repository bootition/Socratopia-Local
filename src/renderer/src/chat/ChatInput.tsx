import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

export interface ChatInputProps {
  /** Called with the trimmed message text. */
  /** Return false to refuse the send; the draft is then kept. */
  onSend: (text: string) => boolean | void | Promise<boolean | void>
  /** Rendered as a cancel control while the assistant is streaming. */
  onCancel?: () => void
  isStreaming?: boolean
  /** Disable sending (e.g. no companion selected). */
  disabled?: boolean
  /**
   * true  → Enter sends, Shift+Enter inserts a newline
   * false → Enter inserts a newline, Ctrl/Cmd+Enter sends
   */
  sendOnEnter?: boolean
  placeholder?: string
  /** Text pushed in from outside (e.g. the calculator result). */
  insertText?: string | null
  /** Called after `insertText` has been consumed. */
  onInsertConsumed?: () => void
}

/**
 * Classroom message composer.
 *
 * The Enter behaviour is preference-driven, and IME composition is
 * never interrupted: pressing Enter to confirm candidate characters
 * does not send the message.
 */
export function ChatInput({
  onSend,
  onCancel,
  isStreaming = false,
  disabled = false,
  sendOnEnter = true,
  placeholder = '向同伴提问…',
  insertText = null,
  onInsertConsumed
}: ChatInputProps): React.ReactElement {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // External inserts (calculator, future quote actions) append to the draft.
  useEffect(() => {
    if (insertText === null) return
    setValue((prev) => (prev.trim().length > 0 ? `${prev} ${insertText}` : insertText))
    onInsertConsumed?.()
  }, [insertText, onInsertConsumed])

  const canSend = !disabled && !isStreaming && value.trim().length > 0

  function submit(): void {
    const text = value.trim()
    // Sending while the companion is replying would be silently dropped;
    // keep the draft instead so nothing is lost.
    if (text.length === 0 || disabled || isStreaming) return
    const accepted = onSend(text)
    // Refused sends (e.g. a previous message is still starting) keep the
    // draft so nothing is silently lost.
    if (accepted === false) return
    setValue('')
    // Keep focus in the composer so the learner can keep typing.
    textareaRef.current?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== 'Enter') return

    // Never treat an IME confirmation Enter as a send.
    if (event.nativeEvent.isComposing) return

    const withModifier = event.ctrlKey || event.metaKey
    const plainEnterSends = sendOnEnter && !event.shiftKey

    if (withModifier || plainEnterSends) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="border-t border-[var(--border)] bg-[var(--card)] p-3">
      <label htmlFor="classroom-message" className="sr-only">
        Message
      </label>
      <textarea
        id="classroom-message"
        ref={textareaRef}
        aria-label="Message"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        {isStreaming && (
          <span className="mr-auto text-xs text-[var(--muted-foreground)]">
            同伴正在回复，可先输入，结束后再发送
          </span>
        )}
        {isStreaming && onCancel !== undefined && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          >
            停止
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          发送
        </button>
      </div>
    </div>
  )
}
