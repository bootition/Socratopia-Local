/**
 * Note store — appends/updates/deletes classroom notes in one JSONL
 * file. Small personal data, so update/delete rewrite the file; reads
 * skip corrupt rows instead of failing.
 */

import { appendFile, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { writeFileAtomic } from '../storage/atomic-write'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  NoteSchema,
  NoteKind,
  NoteColor,
  type Note,
  type NoteColor as NoteColorType
} from '../../shared/schemas/note'

export interface CreateNoteInput {
  conversationId: string
  messageId?: string | null
  kind?: Note['kind']
  text: string
  quote?: string
  color?: NoteColorType
}

export interface UpdateNoteInput {
  text?: string
  color?: NoteColorType
}

function generateNoteId(): string {
  const timestamp = Date.now()
  const random = randomUUID().replace(/-/g, '').slice(0, 12)
  return `note_${timestamp}_${random}`
}

export class NoteStore {
  constructor(private readonly filePath: string) {}

  async list(conversationId?: string): Promise<Note[]> {
    const notes = await this.readAll()
    const filtered =
      conversationId === undefined
        ? notes
        : notes.filter((note) => note.conversationId === conversationId)
    return filtered.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  }

  async create(input: CreateNoteInput): Promise<Note> {
    const text = input.text.trim()
    if (text.length === 0) throw new Error('Note text must not be empty')

    const now = new Date().toISOString()
    const note = NoteSchema.parse({
      id: generateNoteId(),
      conversationId: input.conversationId,
      messageId: input.messageId ?? null,
      kind: input.kind ?? NoteKind.Note,
      text,
      quote: input.quote ?? '',
      color: input.color ?? NoteColor.Yellow,
      createdAt: now,
      updatedAt: now
    }) as Note

    await mkdir(dirname(this.filePath), { recursive: true })
    await appendFile(this.filePath, `${JSON.stringify(note)}\n`, 'utf-8')
    return note
  }

  async update(id: string, patch: UpdateNoteInput): Promise<Note> {
    const notes = await this.readAll()
    const index = notes.findIndex((note) => note.id === id)
    if (index === -1) throw new Error('Note not found')

    const text = patch.text !== undefined ? patch.text.trim() : notes[index].text
    if (text.length === 0) throw new Error('Note text must not be empty')

    const updated = NoteSchema.parse({
      ...notes[index],
      text,
      color: patch.color ?? notes[index].color,
      updatedAt: new Date().toISOString()
    }) as Note

    notes[index] = updated
    await this.writeAll(notes)
    return updated
  }

  async delete(id: string): Promise<void> {
    const notes = await this.readAll()
    const remaining = notes.filter((note) => note.id !== id)
    if (remaining.length === notes.length) throw new Error('Note not found')
    await this.writeAll(remaining)
  }

  private async readAll(): Promise<Note[]> {
    let raw: string
    try {
      raw = await readFile(this.filePath, 'utf-8')
    } catch {
      return []
    }

    const notes: Note[] = []
    for (const line of raw.split('\n')) {
      if (line.trim().length === 0) continue
      try {
        notes.push(NoteSchema.parse(JSON.parse(line)) as Note)
      } catch {
        // Skip corrupt rows.
      }
    }
    return notes
  }

  private async writeAll(notes: Note[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    if (notes.length === 0) {
      await rm(this.filePath, { force: true })
      return
    }
    await writeFileAtomic(
      this.filePath,
      notes.map((note) => JSON.stringify(note)).join('\n') + '\n'
    )
  }
}
