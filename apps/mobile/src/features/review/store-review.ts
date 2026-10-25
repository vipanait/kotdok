import * as StoreReview from 'expo-store-review'
import { File, Paths } from 'expo-file-system'
import type { UrgencyLevel } from '@/features/checks/urgency'
import { localToday } from '@/lib/calendar-day'
import { afterCheck, afterDoseGiven, readState, type Decision, type ReviewState } from './review-rules'

/**
 * The store's rating sheet, asked for by the rules in `review-rules`.
 *
 * What has been asked is kept in the documents folder, like the first-launch
 * marker: it survives restarts and updates and leaves with the app. Signing
 * out keeps it — the store rates the app on this phone, not the account.
 *
 * Nothing here ever throws to the screen that called it: a rating sheet that
 * did not appear is not a failure anyone needs to hear about.
 */

const stateFile = () => new File(Paths.document, 'lapka-review-prompt.json')

let state: ReviewState | null = null

function load(today: string): ReviewState {
  if (state) return state
  try {
    const file = stateFile()
    state = readState(file.exists ? file.textSync() : null, today)
    // Written at once, so the first day is the day the app first ran, not the
    // day something first went well.
    if (!file.exists) save(state)
  } catch {
    state = readState(null, today)
  }
  return state
}

function save(next: ReviewState) {
  state = next
  try {
    const file = stateFile()
    if (!file.exists) file.create()
    file.write(JSON.stringify(next))
  } catch {
    // Kept in memory for this run; the next one starts its first day over.
  }
}

/** On every start: the first one decides which day is the first day. */
export function noteLaunch(): void {
  load(localToday())
}

async function apply(decide: (state: ReviewState, today: string) => Decision): Promise<void> {
  const today = localToday()
  const { state: next, ask } = decide(load(today), today)
  // Saved before anything is awaited, so a second «Дали» a moment later reads
  // this one's count. The ask is spent even if no sheet appears: the system
  // never says whether it showed one, and one ask too few beats two in a row.
  save(next)
  if (!ask) return
  try {
    // False in TestFlight, on an emulator without Play, and on the web.
    if (!(await StoreReview.isAvailableAsync())) return
    await StoreReview.requestReview()
  } catch {
    // Silence, as above.
  }
}

/** A fresh result has been on screen for a moment. */
export function reviewAfterCheck(urgency: UrgencyLevel): Promise<void> {
  return apply((current, today) => afterCheck(current, urgency, today))
}

/** The server has accepted a «Дали». */
export function reviewAfterDoseGiven(): Promise<void> {
  return apply(afterDoseGiven)
}
