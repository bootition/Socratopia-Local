import { z } from 'zod'
import type { WorldId, ProfileId, CompanionId } from '../types/ids'

export interface World {
  id: WorldId
  profileId: ProfileId
  name: string
  story: string
  learnerProfile: string
  companionSlots: { a: CompanionId | null; b: CompanionId | null; c: CompanionId | null }
  createdAt: string
  updatedAt: string
}

const isoDatetime = z.string().datetime({ offset: true })
const companionIdOrNull = z.string().nullable()

const companionSlotsSchema = z.object({
  a: companionIdOrNull,
  b: companionIdOrNull,
  c: companionIdOrNull
}).strict()

export const WorldSchema = z.object({
  id: z.string().min(1),
  profileId: z.string().min(1),
  name: z.string().min(1),
  story: z.string(),
  learnerProfile: z.string(),
  companionSlots: companionSlotsSchema,
  createdAt: isoDatetime,
  updatedAt: isoDatetime
})
