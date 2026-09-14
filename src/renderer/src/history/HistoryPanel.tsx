import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Conversation } from '../../../shared/schemas/conversation'
import type { MessageSearchHit } from '../../../shared/schemas/message'
import {
  ArtifactStatus,
  type EndClassRecord
} from '../../../shared/schemas/artifact'
import type { ArtifactType } from '../../../shared/types/ids'
import { EndClassResultView } from '../artifacts/EndClassButton'
import { toUserMessage } from '../lib/user-message'
import { downloadTextFile } from '../artifacts/flashcard-export'
import {
  buildTranscriptMarkdown,
  transcriptFileName
} from './transcript-export'

const ARTIFACT_TYPES: ArtifactType[] = [
  'lesson_summary',
  'flashcards',
  'diary',
  'progress',
  'handoff_tail'
]

function failedArtifacts(record: EndClassRecord): ArtifactType[] {
  return ARTIFACT_TYPES.filter((type) => record.status[type] === ArtifactStatus.Failed)
}

export interface HistoryPanelProps {
  /** Open a past conversation in the classroom. */
  onOpenConversation: (conversation: Conversation) => void
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('zh-CN')
}

function snippet(content: string, max = 120): string {
  const flat = content.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

/**
 * Lesson history + local keyword search (F20).
 *
 * Lists past conversations and searches message content across all of
 * them; opening a hit returns to the classroom with that conversation
 * selected.
 */
export function HistoryPanel({
  onOpenConversation
}: HistoryPanelProps): React.ReactElement {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [hits, setHits] = useState<MessageSearchHit[] | null>(null)

  const [openArtifactId, setOpenArtifactId] = useState<string | null>(null)
  const [artifacts, setArtifacts] = useState<Record<string, EndClassRecord | null>>({})
  const [artifactsError, setArtifactsError] = useState<string | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [exportNotice, setExportNotice] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [artifactBusyId, setArtifactBusyId] = useState<string | null>(null)

  const openArtifacts = useCallback(async (conversationId: string) => {
    setArtifactsError(null)
    if (openArtifactId === conversationId) {
      setOpenArtifactId(null)
      return
    }
    setOpenArtifactId(conversationId)
    try {
      const record = await window.socratopia.artifacts.get(conversationId)
      setArtifacts((prev) => ({ ...prev, [conversationId]: record }))
    } catch (err: unknown) {
      setArtifactsError(toUserMessage(err, '无法读取课后产物'))
    }
  }, [openArtifactId])

  useEffect(() => {
    let cancelled = false
    window.socratopia.conversations
      .list()
      .then((loaded) => {
        if (!cancelled) setConversations(loaded)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '无法读取历史课堂')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const openConversationById = useCallback(
    (conversationId: string) => {
      const conversation = conversations.find((c) => c.id === conversationId)
      if (conversation === undefined) {
        setSearchError('这节课的元数据缺失，无法打开')
        return
      }
      onOpenConversation(conversation)
    },
    [conversations, onOpenConversation]
  )

  const exportConversation = useCallback(
    async (conversation: Conversation) => {
      if (exportingId !== null) return
      setExportingId(conversation.id)
      setExportError(null)
      try {
        const [messages, notes, artifacts] = await Promise.all([
          window.socratopia.messages.list(conversation.id),
          window.socratopia.notes.list(conversation.id),
          window.socratopia.artifacts.get(conversation.id)
        ])
        const markdown = buildTranscriptMarkdown({
          title: conversation.title,
          messages,
          notes,
          artifacts
        })
        const fileName = transcriptFileName(conversation.title)
        downloadTextFile(fileName, markdown, 'text/markdown')
        setExportError(null)
        setExportNotice(`已导出到浏览器下载目录：${fileName}`)
      } catch (err: unknown) {
        setExportError(toUserMessage(err, '导出课堂失败'))
      } finally {
        setExportingId(null)
      }
    },
    [exportingId]
  )

  const redoArtifacts = useCallback(
    async (conversation: Conversation, types: ArtifactType[]) => {
      setArtifactBusyId(conversation.id)
      setArtifactsError(null)
      try {
        const base = {
          conversationId: conversation.id,
          companionId: conversation.companionId,
          textbookId: conversation.textbookId
        }
        // An empty `only` means "generate nothing"; omit it so the main
        // process generates every artifact type.
        const result =
          types.length > 0
            ? await window.socratopia.artifacts.endClass({ ...base, only: types })
            : await window.socratopia.artifacts.endClass(base)
        setArtifacts((prev) => ({ ...prev, [conversation.id]: result.record }))
      } catch (err: unknown) {
        setArtifactsError(toUserMessage(err, '重试课后产物失败'))
      } finally {
        setArtifactBusyId(null)
      }
    },
    []
  )

  const handleSearch = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const trimmed = query.trim()
      if (trimmed.length < 2) {
        setSearchError('请输入至少 2 个字符')
        return
      }

      setSearching(true)
      setSearchError(null)
      try {
        const found = await window.socratopia.messages.search(trimmed)
        setHits(found)
      } catch (err: unknown) {
        setSearchError(err instanceof Error ? err.message : '搜索失败')
      } finally {
        setSearching(false)
      }
    },
    [query]
  )

  return (
    <section aria-label="历史课堂" className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">历史课堂</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          所有课堂记录都保存在本机，可以随时翻回去继续。
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex items-end gap-2">
        <div className="flex-1">
          <label
            htmlFor="history-search"
            className="block text-sm font-medium text-[var(--foreground)]"
          >
            搜索消息
          </label>
          <input
            id="history-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="例如：惯性"
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] disabled:opacity-50"
        >
          {searching ? '搜索中…' : '搜索'}
        </button>
      </form>

      {searchError !== null && (
        <p role="alert" className="text-sm text-red-400">
          {searchError}
        </p>
      )}

      {artifactsError !== null && (
        <p role="alert" className="text-sm text-red-400">
          {artifactsError}
        </p>
      )}

      {exportError !== null && (
        <p role="alert" className="text-sm text-red-400">
          {exportError}
        </p>
      )}

      {exportNotice !== null && (
        <p role="status" className="text-sm text-[var(--muted-foreground)]">
          {exportNotice}
        </p>
      )}

      {hits !== null && (
        <div aria-label="搜索结果" className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            搜索结果（{hits.length}）
          </h3>
          {hits.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">没有找到匹配的消息。</p>
          ) : (
            <ul className="space-y-2">
              {hits.map((hit) => (
                <li
                  key={hit.messageId}
                  className="rounded-md border border-[var(--border)] bg-[var(--card)] p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {hit.conversationTitle ?? '未命名课堂'} ·{' '}
                      {formatTimestamp(hit.createdAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => openConversationById(hit.conversationId)}
                      className="rounded border border-[var(--border)] px-2 py-0.5 text-xs hover:bg-[var(--muted)]"
                    >
                      打开
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-[var(--foreground)]">
                    {snippet(hit.content)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">全部课堂</h3>

        {loading && (
          <p role="status" className="text-sm text-[var(--muted-foreground)]">
            正在加载历史课堂…
          </p>
        )}

        {error !== null && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        {!loading && error === null && conversations.length === 0 && (
          <p className="text-sm text-[var(--muted-foreground)]">
            还没有历史课堂，去 Classroom 开始第一节课吧。
          </p>
        )}

        {conversations.length > 0 && (
          <ul className="space-y-2">
            {conversations.map((conversation) => (
              <li
                key={conversation.id}
                className="rounded-md border border-[var(--border)] bg-[var(--card)] p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-[var(--foreground)]">
                      {conversation.title}
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {formatTimestamp(conversation.updatedAt)}
                      {conversation.endedAt !== null ? ' · 已下课' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void exportConversation(conversation)}
                      disabled={exportingId !== null}
                      className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--muted)] disabled:opacity-50"
                    >
                      {exportingId === conversation.id ? '导出中…' : '导出课程'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void openArtifacts(conversation.id)}
                      className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--muted)]"
                    >
                      课后产物
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenConversation(conversation)}
                      className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--muted)]"
                    >
                      打开
                    </button>
                  </div>
                </div>

                {openArtifactId === conversation.id && (
                  <div className="mt-3">
                    {artifacts[conversation.id] === undefined ? (
                      <p role="status" className="text-xs text-[var(--muted-foreground)]">
                        正在读取课后产物…
                      </p>
                    ) : artifacts[conversation.id] === null ? (
                      <div className="space-y-2">
                        <p className="text-xs text-[var(--muted-foreground)]">
                          这节课还没有课后产物：可以在下课时生成，也可以现在直接生成。
                        </p>
                        <button
                          type="button"
                          onClick={() => void redoArtifacts(conversation, [])}
                          disabled={artifactBusyId === conversation.id}
                          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--muted)] disabled:opacity-50"
                        >
                          {artifactBusyId === conversation.id
                            ? '生成中…'
                            : '生成课后产物'}
                        </button>
                      </div>
                    ) : (
                      <EndClassResultView
                        record={artifacts[conversation.id]!}
                        failed={failedArtifacts(artifacts[conversation.id]!)}
                        exportTitle={conversation.title}
                        busy={artifactBusyId === conversation.id}
                        onRedo={(types) =>
                          void redoArtifacts(conversation, types)
                        }
                        onSaveFlashcards={async (cards) => {
                          const updated =
                            await window.socratopia.artifacts.updateFlashcards({
                              conversationId: conversation.id,
                              flashcards: cards
                            })
                          setArtifacts((prev) => ({
                            ...prev,
                            [conversation.id]: updated
                          }))
                        }}
                      />
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
