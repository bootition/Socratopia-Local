import { z } from 'zod'
import type { CompanionId } from '../types/ids'
import { CompanionSource, CompanionGender } from '../types/ids'

export interface Companion {
  id: CompanionId
  source: z.infer<typeof companionSourceSchema>
  name: string
  gender: z.infer<typeof companionGenderSchema>
  age: number
  identity: string
  personalityKeywords: string[]
  personality: string
  speakingStyle: string
  emotionalExpressions: string
  originalFile: string
}

const companionSourceSchema = z.enum([
  CompanionSource.Candidate,
  CompanionSource.Custom
])

const companionGenderSchema = z.enum([
  CompanionGender.Male,
  CompanionGender.Female,
  CompanionGender.Other
])

/** Payload for creating/updating a custom companion (F34). */
export interface CustomCompanionInput {
  name: string
  gender: z.infer<typeof companionGenderSchema>
  age: number
  identity: string
  personalityKeywords: string[]
  personality: string
  speakingStyle: string
  emotionalExpressions: string
}

export const CompanionSchema = z.object({
  id: z.string().min(1),
  source: companionSourceSchema,
  name: z.string().min(1),
  gender: companionGenderSchema,
  age: z.number().int().min(0),
  identity: z.string().min(1),
  personalityKeywords: z.array(z.string().min(1)).min(1),
  personality: z.string().min(1),
  speakingStyle: z.string(),
  emotionalExpressions: z.string(),
  originalFile: z.string()
})
