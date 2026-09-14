import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, afterAll } from 'vitest'
import { TextbookSchema } from '../../../src/shared/schemas/textbook'
import type { CreateTextbookFromTextInput } from '../../../src/main/textbooks/textbook-store'
import {
  createTextbookFromText,
  listTextbooks,
  getTextbook
} from '../../../src/main/textbooks/textbook-store'

// --------------- helpers ---------------

const cleanupDirs: string[] = []

async function createTempDir(): Promise<string> {