import { z } from 'zod'
import { PetSchema } from './pet'
import { CalendarDateSchema, UuidSchema } from './primitives'
import { HealthTargetSchema, ParasiteTargetSchema, VaccineTargetSchema } from './health-targets'

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

export const HEALTH_EVENT_KINDS = ['vaccination', 'parasite', 'visit'] as const
/** The kinds made through /events: visits have their own route and fields. */
export const ITEM_EVENT_KINDS = ['vaccination', 'parasite'] as const
export const VISIT_KINDS = ['checkup', 'illness', 'surgery', 'tests', 'other'] as const
export const HEALTH_EVENT_STATUSES = ['done', 'planned'] as const

export const HealthEventKindSchema = z.enum(HEALTH_EVENT_KINDS)
export const ItemEventKindSchema = z.enum(ITEM_EVENT_KINDS)
export const VisitKindSchema = z.enum(VISIT_KINDS)
export type VisitKind = z.infer<typeof VisitKindSchema>
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
  /** A prescription's «как принимать». */
  instructions: z.string().nullable().default(null),
  /** The course a prescription started, while the link lasts. */
  medication_id: UuidSchema.nullable().default(null),
})

export type HealthItem = z.infer<typeof HealthItemSchema>

/**
 * A record: done on `date`, or planned for it. Every planned item is a due date.
 * Not strict: a field a later server adds is dropped by an older app, not fatal.
 */
export const HealthEventSchema = z.object({
  id: UuidSchema,
  kind: HealthEventKindSchema,
  status: HealthEventStatusSchema,
  date: CalendarDateSchema,
  clinic: z.string().nullable(),
  notes: z.string().nullable(),
  items: z.array(HealthItemSchema),
  /** Visits only; null on other kinds. */
  visit_kind: VisitKindSchema.nullable().default(null),
  reason: z.string().nullable().default(null),
  diagnosis: z.string().nullable().default(null),
  check_id: UuidSchema.nullable().default(null),
})

export type HealthEvent = z.infer<typeof HealthEventSchema>

const itemNameSchema = z.string().trim().max(ITEM_NAME_MAX).nullable().optional()
const targetsSchema = z.array(HealthTargetSchema).max(12)
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
    kind: ItemEventKindSchema,
    status: HealthEventStatusSchema,
    date: CalendarDateSchema,
    clinic: z.string().trim().max(CLINIC_MAX).nullable().optional(),
    notes: z.string().trim().max(NOTES_MAX).nullable().optional(),
    items: z.array(HealthItemInputSchema).min(1).max(ITEMS_MAX),
  })
  .superRefine((value, ctx) => {
    const fits = value.kind === 'vaccination' ? VaccineTargetSchema : ParasiteTargetSchema
    value.items.forEach((item, index) => {
      item.targets.forEach((target, at) => {
        if (!fits.safeParse(target).success) {
          ctx.addIssue({ code: 'custom', path: ['items', index, 'targets', at], message: `not a ${value.kind} target` })
        }
      })
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

const VISIT_TEXT_MAX = 500
const MEDICATION_TEXT_MAX_FOR_VISITS = 150

const PrescriptionInputSchema = z.strictObject({
  /** Set for a prescription the visit already has. */
  id: UuidSchema.optional(),
  /** An item of the record, so no longer than any item's name. */
  name: z.string().trim().min(1).max(ITEM_NAME_MAX),
  instructions: z.string().trim().max(MEDICATION_TEXT_MAX_FOR_VISITS).nullable().optional(),
  /** «Добавить в лекарства»: start a course from it. New prescriptions only. */
  add_to_medications: z.boolean().optional(),
})

const visitFields = {
  date: CalendarDateSchema,
  clinic: z.string().trim().max(CLINIC_MAX).nullable().optional(),
  notes: z.string().trim().max(NOTES_MAX).nullable().optional(),
  visit_kind: VisitKindSchema,
  reason: z.string().trim().max(VISIT_TEXT_MAX).nullable().optional(),
  diagnosis: z.string().trim().max(VISIT_TEXT_MAX).nullable().optional(),
  /** The symptom check it followed; of the same pet and owner. */
  check_id: UuidSchema.nullable().optional(),
  prescriptions: z.array(PrescriptionInputSchema).max(10).optional(),
}

/** A plan has not happened: no diagnosis, no prescriptions (MR-07.3). */
function planHasNoTreatment(value: { status?: string; diagnosis?: string | null; prescriptions?: unknown[] }, ctx: z.RefinementCtx) {
  if (value.status !== 'planned') return
  if (value.diagnosis) ctx.addIssue({ code: 'custom', path: ['diagnosis'], message: 'a planned visit has no diagnosis' })
  if (value.prescriptions && value.prescriptions.length > 0) {
    ctx.addIssue({ code: 'custom', path: ['prescriptions'], message: 'a planned visit has no prescriptions' })
  }
}

/** A visit: «Был» (done) with a diagnosis and prescriptions, or planned. */
export const VisitInputSchema = z
  .strictObject({ status: HealthEventStatusSchema, ...visitFields })
  .superRefine(planHasNoTreatment)

export type VisitInput = z.infer<typeof VisitInputSchema>

/**
 * A correction, or a planned visit marked as having happened (`status: 'done'`).
 * Given prescriptions replace the list: `id` keeps one, no `id` adds one.
 */
export const VisitPatchSchema = z
  .strictObject({ status: z.literal('done'), ...visitFields })
  .partial()
  .superRefine(planHasNoTreatment)
  .refine((value) => Object.keys(value).length > 0, { message: 'at least one field is required' })

export type VisitPatch = z.infer<typeof VisitPatchSchema>

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

const MEDICATION_TEXT_MAX = 150

/**
 * A medication course. `started_on` null only for one brought over from the
 * pet form, whose start nobody knows; `ongoing` is «Постоянно», an end that
 * is not coming — different from an end nobody gave.
 */
export const MedicationSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  dosage: z.string().nullable(),
  started_on: CalendarDateSchema.nullable(),
  ended_on: CalendarDateSchema.nullable(),
  ongoing: z.boolean(),
  source: z.enum(['record', 'form']),
})

export type Medication = z.infer<typeof MedicationSchema>

const medicationFields = {
  name: z.string().trim().min(1).max(MEDICATION_TEXT_MAX),
  dosage: z.string().trim().max(MEDICATION_TEXT_MAX).nullable().optional(),
  started_on: CalendarDateSchema.nullable().optional(),
  ended_on: CalendarDateSchema.nullable().optional(),
  ongoing: z.boolean().optional(),
}

/** An end before the start, or an end on a course marked «Постоянно», is refused (MR-06.4). */
function courseRange(value: { started_on?: string | null; ended_on?: string | null; ongoing?: boolean }, ctx: z.RefinementCtx) {
  if (value.ongoing && value.ended_on) {
    ctx.addIssue({ code: 'custom', path: ['ended_on'], message: 'an ongoing course has no end' })
  }
  if (value.started_on && value.ended_on && value.ended_on < value.started_on) {
    ctx.addIssue({ code: 'custom', path: ['ended_on'], message: 'the end is before the start' })
  }
}

export const MedicationInputSchema = z.strictObject(medicationFields).superRefine(courseRange)

/** Several courses at once, as the form adds them. */
export const MedicationsInputSchema = z.strictObject({ items: z.array(MedicationInputSchema).min(1).max(10) })

export type MedicationsInput = z.infer<typeof MedicationsInputSchema>

/** A correction, or «Завершить курс» (`ended_on` today, `ongoing` false). */
export const MedicationPatchSchema = z
  .strictObject(medicationFields)
  .partial()
  .superRefine(courseRange)
  .refine((value) => Object.keys(value).length > 0, { message: 'at least one field is required' })

export type MedicationPatch = z.infer<typeof MedicationPatchSchema>

/** One due date across all of the caller's pets, for the pet list. */
export const DueItemSchema = z.object({
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
  medications: z.array(MedicationSchema).default([]),
})

export type HealthOverview = z.infer<typeof HealthOverviewSchema>

/**
 * Leaves out records of a kind this app does not know yet — a kind a later
 * server introduced. A record of a known kind that is broken still fails
 * the read: hiding it would show a history with a hole in it as complete.
 */
function knownKinds(value: unknown): unknown {
  return Array.isArray(value)
    ? value.filter(
        (entry) =>
          typeof entry !== 'object' ||
          entry === null ||
          (HEALTH_EVENT_KINDS as readonly unknown[]).includes((entry as { kind?: unknown }).kind),
      )
    : value
}

const WEIGHT_FIELDS = ['id', 'measured_on', 'weight_kg', 'source'] as const

/**
 * Records a later server may write in ways this app does not know: a visit
 * of an unknown kind is left out, an interval in an unknown unit becomes no
 * interval (the next date is then chosen by hand), and a weight keeps only
 * the fields this app reads. A broken known record still fails the read.
 */
export function readableEvents(value: unknown): unknown {
  const known = knownKinds(value)
  if (!Array.isArray(known)) return known
  return known
    .filter((entry) => {
      const visitKind = (entry as { visit_kind?: unknown } | null)?.visit_kind
      return visitKind === null || visitKind === undefined || (VISIT_KINDS as readonly unknown[]).includes(visitKind)
    })
    .map((entry) => {
      const items = (entry as { items?: unknown } | null)?.items
      if (!Array.isArray(items)) return entry
      return {
        ...(entry as object),
        items: items.map((item) => {
          const unit = (item as { interval?: { unit?: unknown } | null } | null)?.interval?.unit
          return unit !== undefined && !(INTERVAL_UNITS as readonly unknown[]).includes(unit) ? { ...(item as object), interval: null } : item
        }),
      }
    })
}

export function readableWeights(value: unknown): unknown {
  return Array.isArray(value)
    ? value.map((weight) =>
        weight && typeof weight === 'object'
          ? Object.fromEntries(Object.entries(weight).filter(([key]) => (WEIGHT_FIELDS as readonly string[]).includes(key)))
          : weight,
      )
    : value
}

/** The overview as a client reads it: see {@link readableEvents}, {@link readableWeights}. */
export const HealthOverviewReadSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object') return value
  const overview = value as { events?: unknown; weights?: unknown }
  return { ...overview, events: readableEvents(overview.events), weights: readableWeights(overview.weights) }
}, HealthOverviewSchema)

/** The due list as a client reads it: due dates of an unknown kind are left out. */
export const DueListReadSchema = z.preprocess(knownKinds, z.array(DueItemSchema))
