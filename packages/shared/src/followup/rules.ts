import type {
  FollowupDecision,
  FollowupEscalation,
  FollowupOutcome,
  FollowupPlan,
  FollowupSlot,
  FollowupState,
  Urgency,
} from '@lapka/contracts'

// The follow-up loop's schedule and rules (docs/plans/followup-loop/README.md,
// «Расписание и правила»). The server decides with these; the clients only
// read the decision back, so the two cannot disagree about an outcome.

const HOUR_MS = 60 * 60 * 1000

/** A check older than this gets no offer: nobody watches a check from last week. */
export const FOLLOWUP_OFFER_HOURS = 12
/** A case nobody answers closes this long after its last question. */
export const FOLLOWUP_EXPIRE_DAYS = 7
/** How long a «no, not yet» waits before asking about the vet again. */
const VET_AGAIN_HOURS = 24

export type FollowupSchedule = {
  plan: FollowupPlan
  /** Questions in order, hours after the check they follow. */
  slots: { slot: Exclude<FollowupSlot, 'extra'>; afterHours: number }[]
  defaultEnabled: boolean
}

/**
 * When to ask after a check of this urgency, or `null` when there is nothing
 * to watch.
 *
 * `monitor` promises «наблюдайте 48 часов»: once within the first day, once at
 * the end of the promise. Home care is judged after a day and given three.
 * `urgent` and `emergency` send the owner to a vet, so the next day asks
 * whether they went — and that is offered, not switched on, because those
 * screens must lead to the clinic.
 */
export function followupScheduleFor(urgency: Urgency): FollowupSchedule | null {
  switch (urgency) {
    case 'monitor':
      return { plan: 'watch', slots: [{ slot: 'mid', afterHours: 12 }, { slot: 'final', afterHours: 48 }], defaultEnabled: true }
    case 'home_care':
      return { plan: 'watch', slots: [{ slot: 'mid', afterHours: 24 }, { slot: 'final', afterHours: 72 }], defaultEnabled: true }
    case 'urgent':
    case 'emergency':
      return { plan: 'vet', slots: [{ slot: 'vet', afterHours: 24 }], defaultEnabled: false }
    case 'healthy':
      return null
  }
}

/** When each question of the schedule is due, counted from `from`. */
export function followupDueTimes(schedule: FollowupSchedule, from: Date): { slot: FollowupSlot; dueAt: Date }[] {
  return schedule.slots.map(({ slot, afterHours }) => ({ slot, dueAt: new Date(from.getTime() + afterHours * HOUR_MS) }))
}

/** Whether the result of a check may offer a follow-up now. */
export function followupOfferable(check: { urgency: Urgency; petId: string | null; createdAt: Date }, now: Date): boolean {
  if (!check.petId || followupScheduleFor(check.urgency) === null) return false
  return now.getTime() - check.createdAt.getTime() < FOLLOWUP_OFFER_HOURS * HOUR_MS
}

export const FOLLOWUP_QUIET_FROM_HOUR = 21
export const FOLLOWUP_QUIET_UNTIL_HOUR = 9

/**
 * The moment to actually ring, on the clock of whoever runs this.
 *
 * A question due at night (21:00–09:00) waits for 09:00. Uses the runtime's own
 * time zone — the phone's for a notification, the browser's for «спросим в …».
 */
export function followupFireMoment(dueAt: Date): Date {
  const fire = new Date(dueAt.getTime())
  const hour = fire.getHours()
  if (hour >= FOLLOWUP_QUIET_UNTIL_HOUR && hour < FOLLOWUP_QUIET_FROM_HOUR) return fire
  if (hour >= FOLLOWUP_QUIET_FROM_HOUR) fire.setDate(fire.getDate() + 1)
  fire.setHours(FOLLOWUP_QUIET_UNTIL_HOUR, 0, 0, 0)
  return fire
}

/** What the case looks like when an answer arrives. */
export type FollowupCaseState = {
  plan: FollowupPlan
  /** The question the case is waiting for. */
  nextSlot: Exclude<FollowupSlot, 'extra'>
  nextDueAt: Date
  /** When the check the schedule counts from was made (the origin or the latest re-check). */
  anchorAt: Date
  /** The schedule of that check's urgency. */
  schedule: FollowupSchedule
  originUrgency: Urgency
  /** How many times «были у врача?» has been answered «ещё нет». */
  vetAsks: number
}

export type FollowupAnswer = {
  state: FollowupState
  /** Required when the case asks about the vet. */
  vetVisited?: boolean
}

export type FollowupVerdict = {
  /** Which question the answer counts for. */
  slot: FollowupSlot
  decision: FollowupDecision
  escalation: FollowupEscalation
  /** `null` while the case stays open. */
  outcome: FollowupOutcome | null
  /** The next question, or `null` when the case closes. */
  next: { slot: Exclude<FollowupSlot, 'extra'>; dueAt: Date } | null
  vetAsks: number
}

/** Whether the case's next question is «были у врача?». */
export function followupAsksVet(nextSlot: FollowupSlot | null): boolean {
  return nextSlot === 'vet'
}

/**
 * The slot an answer given now counts for, in a watching case.
 *
 * The latest question whose time has come, even if an earlier one was never
 * answered: «так же» on day three is the final answer, not the twelve-hour one.
 * Before any is due it is an early answer (`extra`), which cannot send anyone to
 * a vet for «не прошло».
 */
function answeredWatchSlot(state: FollowupCaseState, now: Date): FollowupSlot {
  const due = followupDueTimes(state.schedule, state.anchorAt)
  const reached = due.filter(({ dueAt }) => dueAt.getTime() <= now.getTime())
  const pending = due.findIndex(({ slot }) => slot === state.nextSlot)
  const latest = reached.at(-1)
  if (!latest) return 'extra'
  const index = due.findIndex(({ slot }) => slot === latest.slot)
  return index >= pending ? latest.slot : 'extra'
}

export class FollowupAnswerError extends Error {}

/**
 * The fixed rule: what an answer means and what happens next.
 *
 * No model call is involved, and the texts each decision maps to are fixed in
 * the clients' dictionaries.
 */
export function decideFollowup(state: FollowupCaseState, answer: FollowupAnswer, now: Date): FollowupVerdict {
  const vetAgain = { slot: 'vet' as const, dueAt: new Date(now.getTime() + VET_AGAIN_HOURS * HOUR_MS) }

  if (followupAsksVet(state.nextSlot)) {
    if (answer.vetVisited === undefined) throw new FollowupAnswerError('vet_visited is required')
    if (answer.vetVisited) {
      return { slot: 'vet', decision: 'vet_seen', escalation: 'none', outcome: 'vet_seen', next: null, vetAsks: state.vetAsks }
    }
    if (answer.state === 'better') {
      return { slot: 'vet', decision: 'close_improved', escalation: 'none', outcome: 'improved', next: null, vetAsks: state.vetAsks }
    }
    const decision = state.originUrgency === 'emergency' ? 'clinic_now' : 'see_vet_today'
    // Asked twice and still no vet: stop asking rather than nag.
    if (state.vetAsks >= 1) {
      return { slot: 'vet', decision, escalation: decision, outcome: 'unresolved', next: null, vetAsks: state.vetAsks + 1 }
    }
    return { slot: 'vet', decision, escalation: decision, outcome: null, next: vetAgain, vetAsks: state.vetAsks + 1 }
  }

  if (answer.vetVisited !== undefined) throw new FollowupAnswerError('vet_visited is only asked about the vet')

  const slot = answeredWatchSlot(state, now)
  switch (answer.state) {
    case 'better':
      return { slot, decision: 'close_improved', escalation: 'none', outcome: 'improved', next: null, vetAsks: state.vetAsks }
    case 'worse':
      return { slot, decision: 'see_vet_today', escalation: 'see_vet_today', outcome: null, next: vetAgain, vetAsks: state.vetAsks }
    case 'same': {
      if (slot === 'final') {
        return { slot, decision: 'see_vet', escalation: 'see_vet', outcome: null, next: vetAgain, vetAsks: state.vetAsks }
      }
      const due = followupDueTimes(state.schedule, state.anchorAt)
      // After the mid answer the final question keeps its own time from the
      // check: «так же» does not push it two more days away.
      const next =
        slot === 'mid'
          ? due.find(({ slot: s }) => s === 'final') ?? null
          : { slot: state.nextSlot, dueAt: state.nextDueAt }
      return {
        slot,
        decision: 'keep_watching',
        escalation: 'none',
        outcome: null,
        next: next && { slot: next.slot as Exclude<FollowupSlot, 'extra'>, dueAt: next.dueAt },
        vetAsks: state.vetAsks,
      }
    }
  }
}

/** When an unanswered case closes as `expired`. */
export function followupExpiresAt(nextDueAt: Date): Date {
  return new Date(nextDueAt.getTime() + FOLLOWUP_EXPIRE_DAYS * 24 * HOUR_MS)
}
