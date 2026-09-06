import { z } from 'zod'

// Value sets that mirror CHECK constraints in supabase/migrations. Whenever a
// migration changes one of these, the list here has to move with it.

export const URGENCY_LEVELS = ['emergency', 'urgent', 'monitor', 'home_care', 'healthy'] as const
export const PET_SPECIES = ['cat', 'dog'] as const
export const PET_SIZE_CLASSES = ['toy', 'small', 'medium', 'large', 'giant'] as const
export const PET_WALK_ACTIVITIES = ['rare', 'daily_short', 'daily_long', 'sport'] as const
export const PET_SEXES = ['male', 'female'] as const
export const PET_LIFESTYLES = ['indoor', 'outdoor', 'both'] as const
export const PET_DIETS = ['dry', 'wet', 'mixed', 'raw'] as const
export const LOCALES = ['ru', 'en'] as const
export const USER_ROLES = ['user', 'admin'] as const

/** Account lifecycle. Cleanup itself is stage 8; the states exist from stage 1. */
export const ACCOUNT_STATUSES = ['active', 'deleting'] as const

export const UrgencySchema = z.enum(URGENCY_LEVELS)
export const PetSpeciesSchema = z.enum(PET_SPECIES)
export const PetSizeClassSchema = z.enum(PET_SIZE_CLASSES)
export const PetWalkActivitySchema = z.enum(PET_WALK_ACTIVITIES)
export const PetSexSchema = z.enum(PET_SEXES)
export const PetLifestyleSchema = z.enum(PET_LIFESTYLES)
export const PetDietSchema = z.enum(PET_DIETS)
export const LocaleSchema = z.enum(LOCALES)
export const UserRoleSchema = z.enum(USER_ROLES)
export const AccountStatusSchema = z.enum(ACCOUNT_STATUSES)

/** UTC ISO 8601, as the roadmap requires for every date crossing the API. */
export const IsoDateTimeSchema = z.iso.datetime({ offset: true })

export const UuidSchema = z.uuid()

export type Urgency = z.infer<typeof UrgencySchema>
export type PetSpecies = z.infer<typeof PetSpeciesSchema>
export type PetSizeClass = z.infer<typeof PetSizeClassSchema>
export type PetWalkActivity = z.infer<typeof PetWalkActivitySchema>
export type Locale = z.infer<typeof LocaleSchema>
export type UserRole = z.infer<typeof UserRoleSchema>
export type AccountStatus = z.infer<typeof AccountStatusSchema>
