import { z } from 'zod'
import { CalendarDateSchema, IsoDateTimeSchema, PetSpeciesSchema, UrgencySchema, UuidSchema } from './primitives'

// The follow-up loop (docs/plans/followup-loop/README.md): after a check the
// app asks how the pet is doing, and a fixed rule — not the model — says what
// to do next. A check and its answers form one case.
//
// Value sets mirror CHECK constraints in the followup_cases migration.
//
// Responses are `z.object`, not strict: a build already installed must keep
// reading a case after the server learns a new field (the lesson of FB-2/00).
// Inputs stay strict.

/** Header value a client sends in `X-Lapka-Features` to see cases on checks. */
export const FOLLOWUP_FEATURE = 'followup'

export const FOLLOWUP_STATES = ['better', 'same', 'worse'] as const
/** `extra` is an answer given before any question was due. */
export const FOLLOWUP_SLOTS = ['mid', 'final', 'vet', 'extra'] as const
export const FOLLOWUP_PLANS = ['watch', 'vet'] as const
export const FOLLOWUP_STATUSES = ['off', 'active', 'closed'] as const
export const FOLLOWUP_DECISIONS = [
  'close_improved',
  'keep_watching',
  'see_vet',
  'see_vet_today',
  'clinic_now',
  'vet_seen',
] as const
export const FOLLOWUP_ESCALATIONS = ['none', 'see_vet', 'see_vet_today', 'clinic_now'] as const
export const FOLLOWUP_OUTCOMES = [
  'improved',
  'vet_seen',
  'unresolved',
  'dismissed',
  'expired',
  'superseded',
  'pet_deleted',
] as const
export const FOLLOWUP_SOURCES = ['notification', 'pets_list', 'pet_card', 'web_banner', 'timeline', 'result'] as const
export const FOLLOWUP_CLIENTS = ['mobile', 'web'] as const

/** Longest note on a check-in, as the column allows. */
export const FOLLOWUP_NOTE_MAX = 500

export const FollowupStateSchema = z.enum(FOLLOWUP_STATES)
export const FollowupSlotSchema = z.enum(FOLLOWUP_SLOTS)
export const FollowupPlanSchema = z.enum(FOLLOWUP_PLANS)
export const FollowupStatusSchema = z.enum(FOLLOWUP_STATUSES)
export const FollowupDecisionSchema = z.enum(FOLLOWUP_DECISIONS)
export const FollowupEscalationSchema = z.enum(FOLLOWUP_ESCALATIONS)
export const FollowupOutcomeSchema = z.enum(FOLLOWUP_OUTCOMES)
export const FollowupSourceSchema = z.enum(FOLLOWUP_SOURCES)
export const FollowupClientSchema = z.enum(FOLLOWUP_CLIENTS)

export type FollowupState = z.infer<typeof FollowupStateSchema>
export type FollowupSlot = z.infer<typeof FollowupSlotSchema>
export type FollowupPlan = z.infer<typeof FollowupPlanSchema>
export type FollowupStatus = z.infer<typeof FollowupStatusSchema>
export type FollowupDecision = z.infer<typeof FollowupDecisionSchema>
export type FollowupEscalation = z.infer<typeof FollowupEscalationSchema>
export type FollowupOutcome = z.infer<typeof FollowupOutcomeSchema>
export type FollowupSource = z.infer<typeof FollowupSourceSchema>
export type FollowupClient = z.infer<typeof FollowupClientSchema>

/** One answer to «how is the pet?» and what the rule said about it. */
export const FollowupCheckinSchema = z.object({
  id: UuidSchema,
  slot: FollowupSlotSchema,
  vet_visited: z.boolean().nullable(),
  state: FollowupStateSchema,
  note: z.string().nullable(),
  decision: FollowupDecisionSchema,
  created_at: IsoDateTimeSchema,
})

export type FollowupCheckin = z.infer<typeof FollowupCheckinSchema>

/** A check that belongs to the case: the one it started from, or a re-check. */
export const FollowupCaseCheckSchema = z.object({
  check_id: UuidSchema,
  kind: z.enum(['origin', 'recheck']),
  urgency: UrgencySchema,
  /** The first line of what the owner described, at most 200 characters. */
  symptoms: z.string(),
  created_at: IsoDateTimeSchema,
})

export type FollowupCaseCheck = z.infer<typeof FollowupCaseCheckSchema>

/** A vet visit recorded against one of the case's checks. */
export const FollowupCaseVisitSchema = z.object({
  event_id: UuidSchema,
  check_id: UuidSchema,
  status: z.enum(['planned', 'done']),
  date: CalendarDateSchema,
  clinic: z.string().nullable(),
})

export type FollowupCaseVisit = z.infer<typeof FollowupCaseVisitSchema>

/** What lists, cards, banners and notifications need. */
export const FollowupCaseSummarySchema = z.object({
  id: UuidSchema,
  pet_id: UuidSchema,
  pet_name: z.string(),
  pet_species: PetSpeciesSchema,
  origin_check_id: UuidSchema,
  /** When the case's first check was made; «как Мурка после проверки 23 октября». */
  origin_checked_at: IsoDateTimeSchema,
  origin_urgency: UrgencySchema,
  /** The latest check's urgency: a re-check may have changed it. */
  current_urgency: UrgencySchema,
  /** When the check the schedule counts from was made: the origin, or the latest re-check. */
  anchor_at: IsoDateTimeSchema,
  /** The latest check's first symptoms line, for context above the answers. */
  symptoms: z.string(),
  plan: FollowupPlanSchema,
  status: FollowupStatusSchema,
  /** The question that comes next; `vet` asks «были у врача?» first. */
  next_slot: FollowupSlotSchema.nullable(),
  /** When it is due. A phone moves a night moment to 09:00 itself. */
  next_due_at: IsoDateTimeSchema.nullable(),
  escalation: FollowupEscalationSchema,
  outcome: FollowupOutcomeSchema.nullable(),
  hidden_until: IsoDateTimeSchema.nullable(),
  saved_to_record_at: IsoDateTimeSchema.nullable(),
  checkin_count: z.int().min(0),
  closed_at: IsoDateTimeSchema.nullable(),
  created_at: IsoDateTimeSchema,
})

export type FollowupCaseSummary = z.infer<typeof FollowupCaseSummarySchema>

/** One case with its timeline. */
export const FollowupCaseSchema = FollowupCaseSummarySchema.extend({
  checks: z.array(FollowupCaseCheckSchema),
  checkins: z.array(FollowupCheckinSchema),
  visits: z.array(FollowupCaseVisitSchema),
})

export type FollowupCase = z.infer<typeof FollowupCaseSchema>

export const FollowupCaseListSchema = z.object({
  items: z.array(FollowupCaseSummarySchema),
})

export type FollowupCaseList = z.infer<typeof FollowupCaseListSchema>

/**
 * Whether the result screen may offer «Напомнить, как …?».
 *
 * Only for a check younger than twelve hours, with a pet, and not `healthy`.
 * `replaces` names the pet's other open case, which turning this one on closes.
 */
export const FollowupOfferSchema = z.object({
  plan: FollowupPlanSchema,
  default_enabled: z.boolean(),
  first_due_at: IsoDateTimeSchema,
  /** Every question of the plan, in order, as the check's own clock gives them. */
  due_at: z.array(IsoDateTimeSchema),
  replaces: z
    .object({ case_id: UuidSchema, origin_checked_at: IsoDateTimeSchema })
    .nullable(),
})

export type FollowupOffer = z.infer<typeof FollowupOfferSchema>

/** `GET /checks/{id}/followup`: what the result screen shows. */
export const CheckFollowupSchema = z.object({
  offer: FollowupOfferSchema.nullable(),
  /** The case this check belongs to, if any, and in what role. */
  case: FollowupCaseSummarySchema.nullable(),
  role: z.enum(['origin', 'recheck']).nullable(),
})

export type CheckFollowup = z.infer<typeof CheckFollowupSchema>

export const FollowupEnableInputSchema = z.strictObject({
  enabled: z.boolean(),
  via: FollowupClientSchema,
})

export type FollowupEnableInput = z.infer<typeof FollowupEnableInputSchema>

export const FollowupCheckinInputSchema = z.strictObject({
  /** Required when the case asks about the vet (`next_slot = vet`), refused otherwise. */
  vet_visited: z.boolean().optional(),
  state: FollowupStateSchema,
  note: z.string().max(FOLLOWUP_NOTE_MAX).optional(),
  source: FollowupSourceSchema,
})

export type FollowupCheckinInput = z.infer<typeof FollowupCheckinInputSchema>

export const FollowupCheckinResultSchema = z.object({
  checkin: FollowupCheckinSchema,
  case: FollowupCaseSummarySchema,
})

export type FollowupCheckinResult = z.infer<typeof FollowupCheckinResultSchema>

/** «Скрыть до завтра»: the client says when its tomorrow morning is. */
export const FollowupSnoozeInputSchema = z.strictObject({
  until: IsoDateTimeSchema,
})

export type FollowupSnoozeInput = z.infer<typeof FollowupSnoozeInputSchema>

/** A closed case kept in the health record («Перенесённые случаи»). */
export const PastEpisodeSchema = z.object({
  case_id: UuidSchema,
  origin_urgency: UrgencySchema,
  symptoms: z.string(),
  started_at: IsoDateTimeSchema,
  closed_at: IsoDateTimeSchema,
  outcome: FollowupOutcomeSchema,
})

export type PastEpisode = z.infer<typeof PastEpisodeSchema>

export const PastEpisodeListSchema = z.object({
  items: z.array(PastEpisodeSchema),
})
