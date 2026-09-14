import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode
} from 'react'

export interface ClassroomState {
  companionId: string | null
  textbookId: string | null
  conversationId: string | null
}

export interface ClassroomContextValue extends ClassroomState {
  setCompanionId: (id: string | null) => void
  setTextbookId: (id: string | null) => void
  setConversationId: (id: string | null) => void
  /**
   * Change the active companion. Switching to a different one ends the
   * current conversation (the old lesson stays in History), because a
   * conversation's messages and stored companionId belong together.
   */
  selectCompanion: (id: string | null) => void
  /** Change the active textbook; switching ends the current conversation. */
  selectTextbook: (id: string | null) => void
}

const ClassroomContext = createContext<ClassroomContextValue | null>(null)

export function ClassroomProvider({
  children
}: {
  children: ReactNode
}): React.ReactElement {
  const [companionId, setCompanionId] = useState<string | null>(null)
  const [textbookId, setTextbookId] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)

  const selectCompanion = useCallback(
    (id: string | null) => {
      if (conversationId !== null && companionId !== id) {
        setConversationId(null)
      }
      setCompanionId(id)
    },
    [companionId, conversationId]
  )

  const selectTextbook = useCallback(
    (id: string | null) => {
      if (conversationId !== null && textbookId !== id) {
        setConversationId(null)
      }
      setTextbookId(id)
    },
    [textbookId, conversationId]
  )

  return (
    <ClassroomContext.Provider
      value={{
        companionId,
        textbookId,
        conversationId,
        setCompanionId,
        setTextbookId,
        setConversationId,
        selectCompanion,
        selectTextbook
      }}
    >
      {children}
    </ClassroomContext.Provider>
  )
}

export function useClassroom(): ClassroomContextValue {
  const ctx = useContext(ClassroomContext)
  if (ctx === null) {
    throw new Error('useClassroom must be used within a ClassroomProvider')
  }
  return ctx
}