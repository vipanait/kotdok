import {
  CompleteItemInputSchema,
  HEALTH_EVENT_LIMITS,
  type CompleteItemInput,
  type HealthEvent,
  type HealthItem,
} from '@lapka/contracts'
import { eventDayProblem, nextDayProblem, suggestNextDay, type EventDayProblem, type NextDayProblem } from '@lapka/shared'
import type { ContractRefusal } from './event-form'

/**
 * «Сделано» on one item of a plan (web v1 «parasite-complete»,
 * «planned-rabies-complete», implementation-handoff «Окончательное правило»)
 * as data, apart from React so its rules are unit tested:
 *
 * - it marks one item, never the whole plan: the other items of a plan of
 *   several stay planned (`complete_health_item` moves the item into a done
 *   record of its own);
 * - the day it was done starts as the owner's today and is not after it;
 * - the next date is suggested from the item's own interval in its own unit —
 *   12 weeks from 24 September is 17 December, not 3 months later — by the
 *   shared calendar arithmetic (`suggestNextDay`); the owner changes or
 *   clears it; an item with no interval gets no suggestion;
 * - the clinic and the note start as the plan's own, since the server keeps
 *   the plan's clinic unless another is given.
 *
 * The contract's schema has the last word before anything is sent.
 */

/** Which item «Сделано» acts on: the one asked for, the only one, or a question. */
export type CompletionTarget =
  | { kind: 'item'; item: HealthItem }
  /** A plan of several and no item named: ask which one was done. */
  | { kind: 'choose'; items: HealthItem[] }
  /** The item named is not in this plan (done or removed meanwhile). */
  | { kind: 'missing' }

export function completionTarget(plan: HealthEvent, itemId: string | null): CompletionTarget {
  if (itemId !== null) {
    const item = plan.items.find((candidate) => candidate.id === itemId)
    return item ? { kind: 'item', item } : { kind: 'missing' }
  }
  if (plan.items.length === 1) return { kind: 'item', item: plan.items[0] }
  if (plan.items.length === 0) return { kind: 'missing' }
  return { kind: 'choose', items: plan.items }
}

export type CompleteDraft = {
  /** yyyy-mm-dd, or '' when cleared. */
  doneOn: string
  /** '' is none. */
  next: string
  /** The owner set or cleared the next date: a new done day no longer moves it. */
  nextTouched: boolean
  clinic: string
  notes: string
}

function suggested(item: Pick<HealthItem, 'interval'>, doneOn: string, today: string): string {
  if (!doneOn) return ''
  return suggestNextDay(doneOn, item.interval, today) ?? ''
}

export function completeDraft(plan: HealthEvent, item: Pick<HealthItem, 'interval'>, today: string): CompleteDraft {
  return { doneOn: today, next: suggested(item, today, today), nextTouched: false, clinic: plan.clinic ?? '', notes: plan.notes ?? '' }
}

/** A new done day moves a next date the owner has not set by hand. */
export function changeDoneDay(draft: CompleteDraft, item: Pick<HealthItem, 'interval'>, doneOn: string, today: string): CompleteDraft {
  return { ...draft, doneOn, next: draft.nextTouched ? draft.next : suggested(item, doneOn, today) }
}

export type CompleteProblems = {
  doneOn?: EventDayProblem
  next?: NextDayProblem
  clinic?: 'tooLong'
  notes?: 'tooLong'
}

export type ReadCompletion =
  | { ok: true; input: CompleteItemInput }
  | { ok: false; rejected?: false; problems: CompleteProblems }
  | ContractRefusal

const orNull = (text: string) => (text.trim() === '' ? null : text.trim())

/** The body of «Сделано», or what is wrong with the form. */
export function readCompletion(draft: CompleteDraft, today: string): ReadCompletion {
  const problems: CompleteProblems = {}
  const doneOn = eventDayProblem(draft.doneOn, 'done', today)
  if (doneOn) problems.doneOn = doneOn
  if (draft.next !== '') {
    const next = nextDayProblem(draft.next, doneOn ? null : draft.doneOn, today)
    if (next) problems.next = next
  }
  if (draft.clinic.trim().length > HEALTH_EVENT_LIMITS.clinic) problems.clinic = 'tooLong'
  if (draft.notes.trim().length > HEALTH_EVENT_LIMITS.notes) problems.notes = 'tooLong'
  if (Object.keys(problems).length > 0) return { ok: false, problems }

  const input = CompleteItemInputSchema.safeParse({
    done_on: draft.doneOn,
    next_on: draft.next === '' ? null : draft.next,
    clinic: orNull(draft.clinic),
    notes: orNull(draft.notes),
  })
  return input.success ? { ok: true, input: input.data } : { ok: false, rejected: true, problems: {} }
}

export function completionChanged(before: CompleteDraft, after: CompleteDraft): boolean {
  const shape = (draft: CompleteDraft) => JSON.stringify([draft.doneOn, draft.next, draft.clinic, draft.notes])
  return shape(before) !== shape(after)
}

/** The other items of the plan: they stay planned, and the form says so. */
export function othersInPlan(plan: HealthEvent, item: Pick<HealthItem, 'id'>): number {
  return plan.items.filter((candidate) => candidate.id !== item.id).length
}
