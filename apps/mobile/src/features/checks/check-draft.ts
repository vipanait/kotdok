/**
 * Keeping a half-written symptom check across a restart.
 *
 * Describing what is wrong with an animal takes real effort, often while
 * holding the animal. Losing that to a phone deciding to reclaim memory is the
 * kind of loss people do not repeat — they close the app instead.
 *
 * The draft is not a cache of the server's data: nothing here has been sent
 * yet. It belongs to one account and is thrown away when a different one signs
 * in, so a shared phone never shows one person's notes to another.
 */

import {
  ACTIVITY_VALUES,
  APPETITE_VALUES,
  DURATION_VALUES,
  PAIN_SIGNS,
  STOOL_VALUES,
  SYMPTOMS_MAX,
} from '@lapka/contracts'
import { emptyCheckForm, type CheckForm } from './check-form'

/** One key: a second draft would only ever be the same person's older one. */
export const DRAFT_KEY = 'lapka.check-draft'

export type CheckDraft = { form: CheckForm; step: 1 | 2 }

/**
 * Whether anything was actually typed or chosen.
 *
 * A pet is preselected the moment the screen opens, so its presence alone is
 * not evidence of work worth keeping — storing that would resurrect an empty
 * form on every launch.
 */
export function isWorthKeeping(form: CheckForm): boolean {
  return (
    form.symptoms.trim().length > 0 ||
    form.appetite !== null ||
    form.activity !== null ||
    form.duration !== null ||
    form.stool !== null ||
    form.painSigns.length > 0
  )
}

/**
 * Whether the draft on screen is still worth storing.
 *
 * `finished` is the half that was missing and cost people their next check. It
 * means this question is done with, one way or the other: sent, or abandoned by
 * pressing Cancel. Everything else that takes somebody off this screen — a tab,
 * a phone call, the app being killed — is an interruption, and the draft exists
 * for exactly those.
 *
 * Without it the draft was deleted the moment a check was accepted and written
 * straight back on the way out, because leaving the screen saves whatever is in
 * the fields and nothing had cleared them. The next check opened on the
 * previous one's answers, with the previous one's idempotency key behind them.
 */
export function shouldKeepDraft(state: { finished: boolean; form: CheckForm }): boolean {
  return !state.finished && isWorthKeeping(state.form)
}

export function serialiseDraft(userId: string, draft: CheckDraft): string {
  return JSON.stringify({ userId, step: draft.step, form: draft.form })
}

function memberOf<T extends string>(values: readonly T[], raw: unknown): T | null {
  return typeof raw === 'string' && (values as readonly string[]).includes(raw) ? (raw as T) : null
}

/**
 * @returns the draft, or null when there is nothing usable to restore.
 *
 * Everything is checked rather than trusted. The value survives app upgrades,
 * so it may predate a change to the contract; and it survives sign-out on a
 * shared device, so it may belong to someone else. Either way a bad draft must
 * come back as an empty form, never as a crash or as another person's notes.
 */
export function parseDraft(raw: string | null, userId: string): CheckDraft | null {
  if (!raw) return null

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }

  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  // Not this account's: the other person's half-written check is not ours to
  // show, and not ours to send from their balance either.
  if (record.userId !== userId) return null

  if (typeof record.form !== 'object' || record.form === null) return null
  const stored = record.form as Record<string, unknown>

  const symptoms = typeof stored.symptoms === 'string' ? stored.symptoms.slice(0, SYMPTOMS_MAX) : ''
  const painSigns = Array.isArray(stored.painSigns)
    ? stored.painSigns
        .map((sign) => memberOf(PAIN_SIGNS, sign))
        .filter((sign): sign is (typeof PAIN_SIGNS)[number] => sign !== null)
    : []

  const form: CheckForm = {
    ...emptyCheckForm(),
    petId: typeof stored.petId === 'string' ? stored.petId : null,
    symptoms,
    appetite: memberOf(APPETITE_VALUES, stored.appetite),
    activity: memberOf(ACTIVITY_VALUES, stored.activity),
    duration: memberOf(DURATION_VALUES, stored.duration),
    stool: memberOf(STOOL_VALUES, stored.stool),
    painSigns,
  }

  if (!isWorthKeeping(form)) return null

  // Step two without a description would strand the person on a screen whose
  // summary card is empty and whose "Изменить" is the only way forward.
  const step = record.step === 2 && form.symptoms.trim().length > 0 ? 2 : 1

  return { form, step }
}
