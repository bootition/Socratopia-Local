import { z } from 'zod'
import type { ProfileId, WorldId } from '../types/ids'

export interface Profile {
  id: ProfileId
  name: string
  createdAt: string
  updatedAt: string
  activeWorldId: WorldId | null
}

const isoDatetime = z.string().datetime({ offset: true })

export const ProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: isoDatetime,
  updatedAt: isoDatetime,
  activeWorldId: z.string().nullable()
})
