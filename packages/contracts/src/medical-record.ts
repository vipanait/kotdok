import { z } from 'zod'
import { PetSchema } from './pet'
import { CalendarDateSchema, UuidSchema } from './primitives'
import { VaccineTargetSchema } from './health-targets'

/**
 * The five sections of a pet's medical record, in the order the screen lists
 * them. The spec: docs/design/medical-record-spec.md, §3.
 */
export const HEALTH_SECTIONS = ['vaccinations', 'parasites', 'visits', 'medications', 'weight'] as const

export const HealthSectionSchema = z.enum(HEALTH_SECTIONS)

export type HealthSection = z.infer<typeof HealthSectionSchema>


/** Checked here and by the table's CHECK constraint (supabase/migrations, pet_weights). */
export const WEIGHT_MAX_KG = 200

const WeightKgSchema = z.number().positive().max(WEIGHT_MAX_KG)

export const WEIGHT_SOURCES = ['record', 'form'] as const

/**
 * One weighing, newest first in the overview.
 *
 * `measured_on` is null only for the value the pet form held before the
 * record existed: its day is unknown and is not made up. `source: 'form'`
 * marks a weight that came from the form, dated or not.
 */
export const WeightMeasurementSchema = z.strictObject({
  id: UuidSchema,
  measured_on: CalendarDateSchema.nullable(),
  weight_kg: z.number(),
  source: z.enum(WEIGHT_SOURCES),
})

export type WeightMeasurement = z.infer<typeof WeightMeasurementSchema>

/** A new weighing. A second one for the same day replaces that day's value. */
export const WeightInputSchema = z.strictObject({
  measured_on: CalendarDateSchema,
  weight_kg: WeightKgSchema,
})

export type WeightInput = z.infer<typeof WeightInputSchema>

/** A correction. A measurement can move to another day but never lose its date. */
export const WeightPatchSchema = WeightInputSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'at least one field is required' },
)

export type WeightPatch = z.infer<typeof WeightPatchSchema>

export const HEALTH_EVENT_KINDS = ['vaccination'] as const
export const HEALTH_EVENT_STATUSES = ['done', 'planned'] as const

export const HealthEventKindSchema = z.enum(HEALTH_EVENT_KINDS)
export const HealthEventStatusSchema = z.enum(HEALTH_EVENT_STATUSES)

const ITEM_NAME_MAX = 100
const CLINIC_MAX = 100
const NOTES_MAX = 300
const ITEMS_MAX = 10

/**
 * One vaccine in a record. `name` null is «Без препарата»; `source_item_id`
 * is the done item a plan was made from.
 */
export const HealthItemSchema = z.object({
  id: UuidSchema,
  name: z.string().nullable(),
  targets: z.array(z.string()),
  source_item_id: UuidSchema.nullable(),
  /** The catalogue product it was picked from; its name and diseases are copied, not linked. */
  product_id: UuidSchema.nullable().default(null),
  /** The product's repeat interval as it was when picked: what «Сделано» suggests next. */
  interval: z
    .strictObject({ value: z.number().int().positive(), unit: z.enum(['day', 'week', 'month', 'year']) })
    .nullable()
    .default(null),
})

export type HealthItem = z.infer<typeof HealthItemSchema>

/** A record: done on `date`, or planned for it. Every planned item is a due date. */
export const HealthEventSchema = z.strictObject({
  id: UuidSchema,
  kind: HealthEventKindSchema,
  status: HealthEventStatusSchema,
  date: CalendarDateSchema,
  clinic: z.string().nullable(),
  notes: z.string().nullable(),
  items: z.array(HealthItemSchema),
})

export type HealthEvent = z.infer<typeof HealthEventSchema>

const itemNameSchema = z.string().trim().max(ITEM_NAME_MAX).nullable().optional()
const targetsSchema = z.array(VaccineTargetSchema).max(12)
const named = (item: { name?: string | null; targets: unknown[] }) =>
  (item.name ?? '').trim() !== '' || item.targets.length > 0

const HealthItemInputSchema = z
  .strictObject({
    name: itemNameSchema,
    targets: targetsSchema,
    product_id: UuidSchema.nullable().optional(),
    /** The next one of this vaccine; null or absent is «Не напоминать». Done records only. */
    next_on: CalendarDateSchema.nullable().optional(),
  })
  .refine(named, { message: 'a name or at least one disease is required' })

export const HealthEventInputSchema = z
  .strictObject({
    kind: HealthEventKindSchema,
    status: HealthEventStatusSchema,
    date: CalendarDateSchema,
    clinic: z.string().trim().max(CLINIC_MAX).nullable().optional(),
    notes: z.string().trim().max(NOTES_MAX).nullable().optional(),
    items: z.array(HealthItemInputSchema).min(1).max(ITEMS_MAX),
  })
  .superRefine((value, ctx) => {
    value.items.forEach((item, index) => {
      if (!item.next_on) return
      if (value.status === 'planned') {
        ctx.addIssue({ code: 'custom', path: ['items', index, 'next_on'], message: 'a plan has no next date' })
      } else if (item.next_on <= value.date) {
        ctx.addIssue({ code: 'custom', path: ['items', index, 'next_on'], message: 'next date must follow the record' })
      }
    })
  })

export type HealthEventInput = z.infer<typeof HealthEventInputSchema>

/**
 * A correction: the day («Перенести» on a plan), clinic, note, and the items.
 * Given items replace the list: `id` keeps an item, no `id` adds one.
 */
export const HealthEventPatchSchema = z
  .strictObject({
    date: CalendarDateSchema.optional(),
    clinic: z.string().trim().max(CLINIC_MAX).nullable().optional(),
    notes: z.string().trim().max(NOTES_MAX).nullable().optional(),
    items: z
      .array(
        z
          .strictObject({
            id: UuidSchema.optional(),
            name: itemNameSchema,
            targets: targetsSchema,
            product_id: UuidSchema.nullable().optional(),
          })
          .refine(named, { message: 'a name or at least one disease is required' }),
      )
      .min(1)
      .max(ITEMS_MAX)
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'at least one field is required' })

export type HealthEventPatch = z.infer<typeof HealthEventPatchSchema>

/** «Сделано» on one planned item. */
export const CompleteItemInputSchema = z
  .strictObject({
    done_on: CalendarDateSchema,
    next_on: CalendarDateSchema.nullable().optional(),
    clinic: z.string().trim().max(CLINIC_MAX).nullable().optional(),
    notes: z.string().trim().max(NOTES_MAX).nullable().optional(),
  })
  .refine((value) => !value.next_on || value.next_on > value.done_on, {
    message: 'next date must follow the day it was done',
    path: ['next_on'],
  })

export type CompleteItemInput = z.infer<typeof CompleteItemInputSchema>

export const PRODUCT_KINDS = ['vaccine', 'antiparasitic'] as const
export const INTERVAL_UNITS = ['day', 'week', 'month', 'year'] as const

export const ProductKindSchema = z.enum(PRODUCT_KINDS)

export type ProductKind = z.infer<typeof ProductKindSchema>

/** A catalogue product: a vaccine or a treatment, with what it covers and when to repeat it. */
export const HealthProductSchema = z.object({
  id: UuidSchema,
  kind: ProductKindSchema,
  name: z.string(),
  manufacturer: z.string().nullable(),
  aliases: z.array(z.string()),
  species: z.array(z.enum(['cat', 'dog'])),
  form: z.string().nullable(),
  targets: z.array(z.string()),
  /** «По инструкции препарата»: a hint for the next date, never a prescription. */
  interval: z.strictObject({ value: z.number().int().positive(), unit: z.enum(INTERVAL_UNITS) }).nullable(),
  popular: z.boolean(),
})

export type HealthProduct = z.infer<typeof HealthProductSchema>

/** One due date across all of the caller's pets, for the pet list. */
export const DueItemSchema = z.strictObject({
  pet_id: UuidSchema,
  event_id: UuidSchema,
  item_id: UuidSchema,
  kind: HealthEventKindSchema,
  date: CalendarDateSchema,
  name: z.string().nullable(),
  targets: z.array(z.string()),
})

export type DueItem = z.infer<typeof DueItemSchema>

/**
 * Everything the medical record screen needs in one request.
 *
 * `pet` is the pet form exactly as `GET /pets/{id}` returns it: the record is
 * never empty, because what the owner already said in the form is shown there
 * (spec §2.2). `writable` lists the sections this server can store records in;
 * the client offers "add" only for those, so a section a later release brings
 * is not a button that fails.
 *
 * Not strict, unlike the pet itself: every medical record stage adds to this
 * response, and an app already on phones must keep reading it. Unknown keys
 * are dropped, not rejected. The server builds the object field by field, so
 * leniency here lets nothing extra out.
 */
export const HealthOverviewSchema = z.object({
  pet: PetSchema,
  writable: z.array(HealthSectionSchema),
  // Defaulted, so a newer app reading an older server sees an empty history.
  weights: z.array(WeightMeasurementSchema).default([]),
  events: z.array(HealthEventSchema).default([]),
})

export type HealthOverview = z.infer<typeof HealthOverviewSchema>
