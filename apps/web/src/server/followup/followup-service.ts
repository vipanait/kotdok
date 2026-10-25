import 'server-only'

import {
  FOLLOWUP_NOTE_MAX,
  type CheckCaseLink,
  type CheckFollowup,
  type FollowupCase,
  type FollowupCaseSummary,
  type FollowupCheckin,
  type FollowupCheckinInput,
  type FollowupClient,
  type FollowupOffer,
  type FollowupSlot,
  type PastEpisode,
  type Urgency,
} from '@lapka/contracts'
import {
  decideFollowup,
  followupDueTimes,
  followupOfferable,
  followupScheduleFor,
  FollowupAnswerError,
  toUtcIso,
  type FollowupCaseState,
} from '@lapka/shared'
import type { createServiceClient } from '@/server/supabase/server'
import { loadAccount } from '@/server/auth/account-state'
import { consumeRateLimit } from '@/server/api/rate-limit'

type SupabaseService = ReturnType<typeof createServiceClient>

/**
 * The follow-up loop (docs/plans/followup-loop/README.md): cases, answers and
 * what the fixed rule says. No model is called from here.
 */

export type FollowupFailure =
  | 'account_deleting'
  | 'account_not_found'
  | 'not_found'
  /** The check cannot be followed (healthy, no pet, too old) or the case is closed. */
  | 'conflict'
  /** The answer does not fit the question (a vet answer missing or not asked for). */
  | 'invalid'
  | 'too_many_requests'
  | 'storage_error'

export type FollowupResult<T> = { ok: true; data: T } | { ok: false; reason: FollowupFailure }

const fail = (reason: FollowupFailure) => ({ ok: false as const, reason })

const CASE_COLUMNS =
  'id, user_id, pet_id, origin_check_id, origin_urgency, current_urgency, anchor_at, plan, status, next_slot, next_due_at, vet_asks, escalation, outcome, hidden_until, saved_to_record_at, closed_at, created_at, updated_at, pets!inner(name, species, deleted_at), symptom_checks!followup_cases_origin_check_id_fkey!inner(created_at, deleted_at)'

type CaseRow = {
  id: string
  user_id: string
  pet_id: string
  origin_check_id: string
  origin_urgency: Urgency
  current_urgency: Urgency
  anchor_at: string
  plan: 'watch' | 'vet'
  status: 'off' | 'active' | 'closed'
  next_slot: Exclude<FollowupSlot, 'extra'> | null
  next_due_at: string | null
  vet_asks: number
  escalation: FollowupCaseSummary['escalation']
  outcome: FollowupCaseSummary['outcome']
  hidden_until: string | null
  saved_to_record_at: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
  pets: { name: string; species: 'cat' | 'dog'; deleted_at: string | null }
  symptom_checks: { created_at: string; deleted_at: string | null }
}

const iso = (value: string | null) => (value === null ? null : toUtcIso(value))

/** The first line of what the owner described, short enough for a card. */
export function symptomsLine(text: string | null): string {
  const first = (text ?? '').split('\n').find((line) => line.trim() !== '') ?? ''
  const line = first.trim()
  return line.length > 200 ? `${line.slice(0, 199)}…` : line
}

async function requireAccount(supabase: SupabaseService, userId: string): Promise<FollowupResult<null>> {
  const account = await loadAccount(supabase, userId)
  if (!account.ok) return fail(account.reason === 'account_deleting' ? 'account_deleting' : 'account_not_found')
  return { ok: true, data: null }
}

/** Latest check symptoms and answer counts for a set of cases. */
async function caseExtras(supabase: SupabaseService, caseIds: string[]) {
  const symptoms = new Map<string, string>()
  const counts = new Map<string, number>()
  if (caseIds.length === 0) return { ok: true as const, symptoms, counts }

  const [checks, checkins] = await Promise.all([
    supabase
      .from('followup_case_checks')
      .select('case_id, created_at, symptom_checks!inner(symptoms_input, created_at)')
      .in('case_id', caseIds),
    supabase.from('followup_checkins').select('case_id').in('case_id', caseIds),
  ])
  if (checks.error || checkins.error) return { ok: false as const }

  const latest = new Map<string, string>()
  for (const row of checks.data as unknown as { case_id: string; symptom_checks: { symptoms_input: string; created_at: string } }[]) {
    const at = toUtcIso(row.symptom_checks.created_at)
    if ((latest.get(row.case_id) ?? '') <= at) {
      latest.set(row.case_id, at)
      symptoms.set(row.case_id, symptomsLine(row.symptom_checks.symptoms_input))
    }
  }
  for (const row of checkins.data as { case_id: string }[]) counts.set(row.case_id, (counts.get(row.case_id) ?? 0) + 1)
  return { ok: true as const, symptoms, counts }
}

function summarise(row: CaseRow, symptoms: string, checkinCount: number): FollowupCaseSummary {
  return {
    id: row.id,
    pet_id: row.pet_id,
    pet_name: row.pets.name,
    pet_species: row.pets.species,
    origin_check_id: row.origin_check_id,
    origin_checked_at: toUtcIso(row.symptom_checks.created_at),
    origin_urgency: row.origin_urgency,
    current_urgency: row.current_urgency,
    symptoms,
    plan: row.plan,
    status: row.status,
    next_slot: row.next_slot,
    next_due_at: iso(row.next_due_at),
    escalation: row.escalation,
    outcome: row.outcome,
    hidden_until: iso(row.hidden_until),
    saved_to_record_at: iso(row.saved_to_record_at),
    checkin_count: checkinCount,
    closed_at: iso(row.closed_at),
    created_at: toUtcIso(row.created_at),
  }
}

async function summariseRows(supabase: SupabaseService, rows: CaseRow[]): Promise<FollowupResult<FollowupCaseSummary[]>> {
  const extras = await caseExtras(supabase, rows.map((row) => row.id))
  if (!extras.ok) return fail('storage_error')
  return {
    ok: true,
    data: rows.map((row) => summarise(row, extras.symptoms.get(row.id) ?? '', extras.counts.get(row.id) ?? 0)),
  }
}

/** A case of this user whose pet and first check still show. */
async function loadCase(supabase: SupabaseService, userId: string, caseId: string): Promise<FollowupResult<CaseRow>> {
  const { data, error } = await supabase
    .from('followup_cases')
    .select(CASE_COLUMNS)
    .eq('id', caseId)
    .eq('user_id', userId)
    .neq('status', 'off')
    .is('pets.deleted_at', null)
    .is('symptom_checks.deleted_at', null)
    .maybeSingle()
  if (error) return fail('storage_error')
  if (!data) return fail('not_found')
  return { ok: true, data: data as unknown as CaseRow }
}

type CheckRow = { id: string; urgency: Urgency; pet_id: string | null; created_at: string }

async function loadOwnCheck(supabase: SupabaseService, userId: string, checkId: string): Promise<FollowupResult<CheckRow>> {
  const { data, error } = await supabase
    .from('symptom_checks')
    .select('id, urgency, pet_id, created_at, pets(deleted_at)')
    .eq('id', checkId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) return fail('storage_error')
  if (!data) return fail('not_found')
  const row = data as unknown as CheckRow & { pets: { deleted_at: string | null } | null }
  // A check of a deleted pet reads as one without a pet: nothing to follow.
  const petId = row.pets && row.pets.deleted_at === null ? row.pet_id : null
  return { ok: true, data: { id: row.id, urgency: row.urgency, pet_id: petId, created_at: toUtcIso(row.created_at) } }
}

async function activeCaseOfPet(supabase: SupabaseService, userId: string, petId: string) {
  return supabase
    .from('followup_cases')
    .select('id, origin_check_id, symptom_checks!followup_cases_origin_check_id_fkey!inner(created_at)')
    .eq('user_id', userId)
    .eq('pet_id', petId)
    .eq('status', 'active')
    .maybeSingle()
}

function offerFor(check: CheckRow, replaces: FollowupOffer['replaces']): FollowupOffer {
  const schedule = followupScheduleFor(check.urgency)!
  const due = followupDueTimes(schedule, new Date(check.created_at))
  return {
    plan: schedule.plan,
    default_enabled: schedule.defaultEnabled,
    first_due_at: due[0]!.dueAt.toISOString(),
    due_at: due.map(({ dueAt }) => dueAt.toISOString()),
    replaces,
  }
}

/**
 * What the result screen of one check shows: an offer, the case the check
 * belongs to, or both (an offer still switchable, with its `off` or `active`
 * case).
 */
export async function getCheckFollowup(
  supabase: SupabaseService,
  userId: string,
  checkId: string,
  now: Date = new Date(),
): Promise<FollowupResult<CheckFollowup>> {
  const access = await requireAccount(supabase, userId)
  if (!access.ok) return access
  const check = await loadOwnCheck(supabase, userId, checkId)
  if (!check.ok) return check

  const { data: link, error: linkError } = await supabase
    .from('followup_case_checks')
    .select('case_id, kind')
    .eq('check_id', checkId)
    .eq('user_id', userId)
    .maybeSingle()
  if (linkError) return fail('storage_error')

  let summary: FollowupCaseSummary | null = null
  if (link) {
    const { data, error } = await supabase
      .from('followup_cases')
      .select(CASE_COLUMNS)
      .eq('id', link.case_id)
      .eq('user_id', userId)
      .is('pets.deleted_at', null)
      .maybeSingle()
    if (error) return fail('storage_error')
    if (data) {
      const rows = await summariseRows(supabase, [data as unknown as CaseRow])
      if (!rows.ok) return rows
      summary = rows.data[0]!
    }
  }

  // A re-check belongs to its case: it gets no switch of its own.
  const role = link ? (link.kind as 'origin' | 'recheck') : null
  const switchable =
    role !== 'recheck' &&
    (summary === null || summary.status !== 'closed') &&
    followupOfferable({ urgency: check.data.urgency, petId: check.data.pet_id, createdAt: new Date(check.data.created_at) }, now)

  let offer: FollowupOffer | null = null
  if (switchable) {
    const { data: other, error } = await activeCaseOfPet(supabase, userId, check.data.pet_id!)
    if (error) return fail('storage_error')
    const otherRow = other as unknown as { id: string; origin_check_id: string; symptom_checks: { created_at: string } } | null
    const replaces =
      otherRow && otherRow.origin_check_id !== checkId
        ? { case_id: otherRow.id, origin_checked_at: toUtcIso(otherRow.symptom_checks.created_at) }
        : null
    offer = offerFor(check.data, replaces)
  }

  // An `off` case is returned too: it is how the switch knows it was turned off.
  return { ok: true, data: { offer, case: summary, role } }
}

/**
 * Switches the follow-up of a check on or off, from its result screen.
 * The first call creates the case, `off` or `active`.
 */
export async function setCheckFollowup(
  supabase: SupabaseService,
  userId: string,
  checkId: string,
  input: { enabled: boolean; via: FollowupClient },
  now: Date = new Date(),
): Promise<FollowupResult<CheckFollowup>> {
  const access = await requireAccount(supabase, userId)
  if (!access.ok) return access
  const check = await loadOwnCheck(supabase, userId, checkId)
  if (!check.ok) return check

  const { data: link, error: linkError } = await supabase
    .from('followup_case_checks')
    .select('kind')
    .eq('check_id', checkId)
    .maybeSingle()
  if (linkError) return fail('storage_error')
  if (link?.kind === 'recheck') return fail('conflict')

  const createdAt = new Date(check.data.created_at)
  if (!followupOfferable({ urgency: check.data.urgency, petId: check.data.pet_id, createdAt }, now)) return fail('conflict')

  const rate = await consumeRateLimit(supabase, 'followup_write', userId, now)
  if (!rate.allowed) return fail('too_many_requests')

  const schedule = followupScheduleFor(check.data.urgency)!
  const [first] = followupDueTimes(schedule, createdAt)
  const { error } = await supabase.rpc('set_followup_enabled', {
    p_user_id: userId,
    p_check_id: checkId,
    p_pet_id: check.data.pet_id,
    p_urgency: check.data.urgency,
    p_anchor_at: createdAt.toISOString(),
    p_plan: schedule.plan,
    p_next_slot: first!.slot,
    p_next_due_at: first!.dueAt.toISOString(),
    p_via: input.via,
    p_enabled: input.enabled,
  })
  if (error) {
    console.error('set_followup_enabled failed:', error.message)
    return fail('storage_error')
  }
  return getCheckFollowup(supabase, userId, checkId, now)
}

/** Open cases, earliest question first: the phone's notifications, the cards and the banner. */
export async function listActiveFollowups(
  supabase: SupabaseService,
  userId: string,
): Promise<FollowupResult<FollowupCaseSummary[]>> {
  const access = await requireAccount(supabase, userId)
  if (!access.ok) return access
  const { data, error } = await supabase
    .from('followup_cases')
    .select(CASE_COLUMNS)
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('pets.deleted_at', null)
    .is('symptom_checks.deleted_at', null)
    .order('next_due_at')
    .limit(50)
  if (error) return fail('storage_error')
  return summariseRows(supabase, data as unknown as CaseRow[])
}

type CheckinRow = {
  id: string
  slot: FollowupSlot
  vet_visited: boolean | null
  state: FollowupCheckin['state']
  note: string | null
  decision: FollowupCheckin['decision']
  created_at: string
}

const CHECKIN_COLUMNS = 'id, slot, vet_visited, state, note, decision, created_at'

function mapCheckin(row: CheckinRow): FollowupCheckin {
  return { ...row, created_at: toUtcIso(row.created_at) }
}

/** One case with its timeline: checks, answers, visits recorded against its checks. */
export async function getFollowupCase(
  supabase: SupabaseService,
  userId: string,
  caseId: string,
): Promise<FollowupResult<FollowupCase>> {
  const access = await requireAccount(supabase, userId)
  if (!access.ok) return access
  const found = await loadCase(supabase, userId, caseId)
  if (!found.ok) return found

  const [checks, checkins] = await Promise.all([
    supabase
      .from('followup_case_checks')
      .select('check_id, kind, symptom_checks!inner(urgency, symptoms_input, created_at, deleted_at)')
      .eq('case_id', caseId)
      .is('symptom_checks.deleted_at', null),
    supabase.from('followup_checkins').select(CHECKIN_COLUMNS).eq('case_id', caseId).order('created_at'),
  ])
  if (checks.error || checkins.error) return fail('storage_error')

  const caseChecks = (
    checks.data as unknown as {
      check_id: string
      kind: 'origin' | 'recheck'
      symptom_checks: { urgency: Urgency; symptoms_input: string; created_at: string }
    }[]
  )
    .map((row) => ({
      check_id: row.check_id,
      kind: row.kind,
      urgency: row.symptom_checks.urgency,
      symptoms: symptomsLine(row.symptom_checks.symptoms_input),
      created_at: toUtcIso(row.symptom_checks.created_at),
    }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  const { data: visits, error: visitError } = await supabase
    .from('pet_health_events')
    .select('id, check_id, status, event_date, clinic')
    .eq('user_id', userId)
    .eq('kind', 'visit')
    .is('deleted_at', null)
    .in('check_id', caseChecks.map((check) => check.check_id))
    .order('event_date')
  if (visitError) return fail('storage_error')

  const latest = caseChecks.at(-1)
  const summary = summarise(found.data, latest?.symptoms ?? '', checkins.data.length)
  return {
    ok: true,
    data: {
      ...summary,
      checks: caseChecks,
      checkins: (checkins.data as CheckinRow[]).map(mapCheckin),
      visits: (visits as { id: string; check_id: string; status: 'planned' | 'done'; event_date: string; clinic: string | null }[]).map(
        (visit) => ({ event_id: visit.id, check_id: visit.check_id, status: visit.status, date: visit.event_date, clinic: visit.clinic }),
      ),
    },
  }
}

function caseState(row: CaseRow): FollowupCaseState | null {
  const schedule = followupScheduleFor(row.current_urgency)
  if (!schedule || !row.next_slot || !row.next_due_at) return null
  return {
    plan: row.plan,
    nextSlot: row.next_slot,
    nextDueAt: new Date(row.next_due_at),
    anchorAt: new Date(row.anchor_at),
    schedule,
    originUrgency: row.origin_urgency,
    vetAsks: row.vet_asks,
  }
}

/**
 * Stores «лучше / так же / хуже» and moves the case on by the rule.
 *
 * A repeated idempotency key returns the answer already stored. If another
 * device moved the case between the read and the write, the rule runs again on
 * the case as it is now.
 */
export async function recordFollowupCheckin(
  supabase: SupabaseService,
  userId: string,
  caseId: string,
  input: FollowupCheckinInput,
  idempotencyKey: string,
  now: Date = new Date(),
): Promise<FollowupResult<{ checkin: FollowupCheckin; case: FollowupCaseSummary; created: boolean }>> {
  const access = await requireAccount(supabase, userId)
  if (!access.ok) return access

  const repeated = await storedCheckin(supabase, userId, caseId, idempotencyKey)
  if (!repeated.ok) return repeated
  if (repeated.data) return repeated.data

  const rate = await consumeRateLimit(supabase, 'followup_write', userId, now)
  if (!rate.allowed) return fail('too_many_requests')

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const found = await loadCase(supabase, userId, caseId)
    if (!found.ok) return found
    if (found.data.status !== 'active') return fail('conflict')
    const state = caseState(found.data)
    if (!state) return fail('conflict')

    let verdict
    try {
      verdict = decideFollowup(state, { state: input.state, vetVisited: input.vet_visited }, now)
    } catch (error) {
      if (error instanceof FollowupAnswerError) return fail('invalid')
      throw error
    }

    const originAt = new Date(found.data.symptom_checks.created_at)
    const hours = Math.max(0, Math.round(((now.getTime() - originAt.getTime()) / 3_600_000) * 10) / 10)
    const { data, error } = await supabase.rpc('record_followup_checkin', {
      p_user_id: userId,
      p_case_id: caseId,
      p_seen: found.data.updated_at,
      p_key: idempotencyKey,
      p_slot: verdict.slot,
      p_vet_visited: verdict.slot === 'vet' ? input.vet_visited ?? null : null,
      p_state: input.state,
      p_note: input.note?.slice(0, FOLLOWUP_NOTE_MAX) ?? null,
      p_decision: verdict.decision,
      p_source: input.source,
      p_hours: hours,
      p_next_slot: verdict.next?.slot ?? null,
      p_next_due_at: verdict.next?.dueAt.toISOString() ?? null,
      p_escalation: verdict.escalation,
      p_outcome: verdict.outcome,
      p_vet_asks: verdict.vetAsks,
    })
    if (error) {
      console.error('record_followup_checkin failed:', error.message)
      return fail('storage_error')
    }
    const status = (data as { status: string }).status
    if (status === 'stale') continue
    if (status === 'not_found') return fail('not_found')
    if (status === 'closed') return fail('conflict')

    const stored = await storedCheckin(supabase, userId, caseId, idempotencyKey)
    if (!stored.ok) return stored
    if (!stored.data) return fail('storage_error')
    return { ok: true, data: { ...stored.data.data, created: status === 'recorded' } }
  }
  return fail('conflict')
}

/** The answer stored under this key, with the case as it is now. */
async function storedCheckin(
  supabase: SupabaseService,
  userId: string,
  caseId: string,
  key: string,
): Promise<FollowupResult<{ ok: true; data: { checkin: FollowupCheckin; case: FollowupCaseSummary; created: boolean } } | null>> {
  const { data, error } = await supabase
    .from('followup_checkins')
    .select(CHECKIN_COLUMNS)
    .eq('case_id', caseId)
    .eq('user_id', userId)
    .eq('idempotency_key', key)
    .maybeSingle()
  if (error) return fail('storage_error')
  if (!data) return { ok: true, data: null }

  const { data: row, error: caseError } = await supabase
    .from('followup_cases')
    .select(CASE_COLUMNS)
    .eq('id', caseId)
    .eq('user_id', userId)
    .maybeSingle()
  if (caseError) return fail('storage_error')
  if (!row) return fail('not_found')
  const summary = await summariseRows(supabase, [row as unknown as CaseRow])
  if (!summary.ok) return summary
  return {
    ok: true,
    data: { ok: true, data: { checkin: mapCheckin(data as CheckinRow), case: summary.data[0]!, created: false } },
  }
}

/** «Не напоминать больше»: closes an open case with no medical outcome. */
export async function dismissFollowup(
  supabase: SupabaseService,
  userId: string,
  caseId: string,
  now: Date = new Date(),
): Promise<FollowupResult<FollowupCaseSummary>> {
  return updateOpenCase(supabase, userId, caseId, {
    status: 'closed',
    outcome: 'dismissed',
    closed_at: now.toISOString(),
    next_slot: null,
    next_due_at: null,
    hidden_until: null,
    updated_at: now.toISOString(),
  })
}

/** «Скрыть до завтра»: the case stays open; banners and cards wait until `until`. */
export async function snoozeFollowup(
  supabase: SupabaseService,
  userId: string,
  caseId: string,
  until: Date,
  now: Date = new Date(),
): Promise<FollowupResult<FollowupCaseSummary>> {
  // Tomorrow morning is at most two days away in any time zone.
  if (until.getTime() <= now.getTime() || until.getTime() - now.getTime() > 48 * 3_600_000) return fail('invalid')
  return updateOpenCase(supabase, userId, caseId, { hidden_until: until.toISOString(), updated_at: now.toISOString() })
}

async function updateOpenCase(
  supabase: SupabaseService,
  userId: string,
  caseId: string,
  patch: Record<string, unknown>,
): Promise<FollowupResult<FollowupCaseSummary>> {
  const access = await requireAccount(supabase, userId)
  if (!access.ok) return access
  const found = await loadCase(supabase, userId, caseId)
  if (!found.ok) return found
  if (found.data.status !== 'active') return fail('conflict')

  const { data, error } = await supabase
    .from('followup_cases')
    .update(patch)
    .eq('id', caseId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .select('id')
  if (error) return fail('storage_error')
  if (!data || data.length === 0) return fail('conflict')
  const again = await loadCase(supabase, userId, caseId)
  if (!again.ok) return again
  const rows = await summariseRows(supabase, [again.data])
  if (!rows.ok) return rows
  return { ok: true, data: rows.data[0]! }
}

/** Keeps a closed case in «Перенесённые случаи», or takes it out. Repeating either changes nothing. */
export async function setFollowupRecord(
  supabase: SupabaseService,
  userId: string,
  caseId: string,
  saved: boolean,
  now: Date = new Date(),
): Promise<FollowupResult<FollowupCaseSummary>> {
  const access = await requireAccount(supabase, userId)
  if (!access.ok) return access
  const found = await loadCase(supabase, userId, caseId)
  if (!found.ok) return found
  if (found.data.status !== 'closed') return fail('conflict')

  if (saved !== (found.data.saved_to_record_at !== null)) {
    const { error } = await supabase
      .from('followup_cases')
      .update({ saved_to_record_at: saved ? now.toISOString() : null, updated_at: now.toISOString() })
      .eq('id', caseId)
      .eq('user_id', userId)
      .eq('status', 'closed')
    if (error) return fail('storage_error')
  }
  const again = await loadCase(supabase, userId, caseId)
  if (!again.ok) return again
  const rows = await summariseRows(supabase, [again.data])
  if (!rows.ok) return rows
  return { ok: true, data: rows.data[0]! }
}

/** «Перенесённые случаи» of one pet, newest first; `since` limits them for the vet summary. */
export async function listPastEpisodes(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  since?: Date,
): Promise<FollowupResult<PastEpisode[]>> {
  const access = await requireAccount(supabase, userId)
  if (!access.ok) return access
  const { data: pet, error: petError } = await supabase
    .from('pets')
    .select('id')
    .eq('id', petId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  if (petError) return fail('storage_error')
  if (!pet) return fail('not_found')
  return pastEpisodesOf(supabase, userId, [petId], since)
}

/** Episodes of several pets at once, for the dashboard and summaries. */
export async function pastEpisodesOf(
  supabase: SupabaseService,
  userId: string,
  petIds: string[],
  since?: Date,
): Promise<FollowupResult<(PastEpisode & { pet_id: string })[]>> {
  if (petIds.length === 0) return { ok: true, data: [] }
  let query = supabase
    .from('followup_cases')
    .select(CASE_COLUMNS)
    .eq('user_id', userId)
    .in('pet_id', petIds)
    .eq('status', 'closed')
    .not('saved_to_record_at', 'is', null)
    .is('symptom_checks.deleted_at', null)
    .order('closed_at', { ascending: false })
    .limit(100)
  if (since) query = query.gte('closed_at', since.toISOString())
  const { data, error } = await query
  if (error) return fail('storage_error')
  const rows = data as unknown as CaseRow[]
  const extras = await caseExtras(supabase, rows.map((row) => row.id))
  if (!extras.ok) return fail('storage_error')
  return {
    ok: true,
    data: rows.map((row) => ({
      pet_id: row.pet_id,
      case_id: row.id,
      origin_urgency: row.origin_urgency,
      symptoms: extras.symptoms.get(row.id) ?? '',
      started_at: toUtcIso(row.symptom_checks.created_at),
      closed_at: toUtcIso(row.closed_at!),
      outcome: row.outcome!,
    })),
  }
}


/** The case each check belongs to, for the history of a client that reads `followup`. */
export async function caseLinksOf(
  supabase: SupabaseService,
  userId: string,
  checkIds: string[],
): Promise<FollowupResult<Map<string, CheckCaseLink>>> {
  const links = new Map<string, CheckCaseLink>()
  if (checkIds.length === 0) return { ok: true, data: links }
  const { data, error } = await supabase
    .from('followup_case_checks')
    .select('check_id, kind, followup_cases!inner(id, status, outcome)')
    .eq('user_id', userId)
    .in('check_id', checkIds)
    .neq('followup_cases.status', 'off')
  if (error) return fail('storage_error')
  for (const row of data as unknown as {
    check_id: string
    kind: 'origin' | 'recheck'
    followup_cases: { id: string; status: CheckCaseLink['status']; outcome: CheckCaseLink['outcome'] }
  }[]) {
    links.set(row.check_id, {
      case_id: row.followup_cases.id,
      kind: row.kind,
      status: row.followup_cases.status,
      outcome: row.followup_cases.outcome,
    })
  }
  return { ok: true, data: links }
}

/** Closes cases nobody answered for a week (daily cron). */
export async function expireFollowups(supabase: SupabaseService, now: Date = new Date()): Promise<number> {
  const { data, error } = await supabase.rpc('expire_followup_cases', { p_now: now.toISOString() })
  if (error) throw new Error(`expire_followup_cases failed: ${error.message}`)
  return data as number
}

/**
 * Adds `followup` to checks for a client that reads it. Without the feature the
 * checks go out exactly as before.
 */
export async function withCaseLinks<T extends { id: string }>(
  supabase: SupabaseService,
  userId: string,
  checks: T[],
): Promise<FollowupResult<(T & { followup: CheckCaseLink | null })[]>> {
  const links = await caseLinksOf(supabase, userId, checks.map((check) => check.id))
  if (!links.ok) return links
  return { ok: true, data: checks.map((check) => ({ ...check, followup: links.data.get(check.id) ?? null })) }
}
