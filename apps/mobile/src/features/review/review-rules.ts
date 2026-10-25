import { daysBetween } from '@/lib/calendar-day'
import type { UrgencyLevel } from '@/features/checks/urgency'

/**
 * When the store's own rating sheet may be asked for (ASO audit, 2026-10-25:
 * no ratings in either store). Only after a moment that went well — a calm
 * answer to a check, a dose given again — and never straight to a person who
 * has just been told to drive to a clinic.
 *
 * The system sheet is called with nothing of ours in front of it: a «Нравится
 * приложение?» that only lets the happy ones through is review gating, which
 * both stores refuse. The system also keeps its own limit (iOS shows the sheet
 * at most three times a year) and may stay silent; these rules only keep the
 * app from asking more often than that on top.
 *
 * Calendar days throughout, as in the medical record: «the first day» is the
 * day on the phone's calendar, not the first 24 hours.
 */

/** Never more often than this. */
export const DAYS_BETWEEN_ASKS = 60
/** And never more than this many times in all. */
export const MAX_ASKS = 3
/** «Дали» counts from this many on: the second dose means the course is in use. */
export const DOSES_BEFORE_ASKING = 2

export type ReviewState = {
  /** The first day the app ran with this in it — not a day to ask on. */
  firstDay: string
  /** How many times the sheet has been asked for. */
  asked: number
  lastAskedDay: string | null
  /** «Дали» pressed and accepted by the server, ever. */
  dosesGiven: number
}

export function freshState(today: string): ReviewState {
  return { firstDay: today, asked: 0, lastAskedDay: null, dosesGiven: 0 }
}

/**
 * What was stored, or a fresh start from today. Anything unreadable starts
 * over from today too: the worst case is one quiet day more, never an extra
 * ask.
 */
export function readState(raw: string | null, today: string): ReviewState {
  if (raw === null) return freshState(today)
  try {
    const value = JSON.parse(raw) as Partial<ReviewState>
    const isDay = (day: unknown): day is string => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)
    const isCount = (count: unknown): count is number => Number.isInteger(count) && (count as number) >= 0
    if (
      isDay(value.firstDay) &&
      isCount(value.asked) &&
      (value.lastAskedDay === null || isDay(value.lastAskedDay)) &&
      isCount(value.dosesGiven)
    ) {
      return {
        firstDay: value.firstDay,
        asked: value.asked,
        lastAskedDay: value.lastAskedDay,
        dosesGiven: value.dosesGiven,
      }
    }
  } catch {
    // Not JSON: start over, below.
  }
  return freshState(today)
}

/**
 * Whether the rules leave room to ask today. A clock set back before the first
 * day or the last ask reads as too early, not as a free pass.
 */
export function mayAsk(state: ReviewState, today: string): boolean {
  if (state.asked >= MAX_ASKS) return false
  if (daysBetween(state.firstDay, today) < 1) return false
  return state.lastAskedDay === null || daysBetween(state.lastAskedDay, today) >= DAYS_BETWEEN_ASKS
}

/** The results that are good news. «НАБЛЮДАЕМ» is not: it ends in «при ухудшении — к врачу». */
export function isCalmResult(urgency: UrgencyLevel): boolean {
  return urgency === 'healthy' || urgency === 'home_care'
}

export type Decision = { state: ReviewState; ask: boolean }

function decide(state: ReviewState, moment: boolean, today: string): Decision {
  if (!moment || !mayAsk(state, today)) return { state, ask: false }
  return { state: { ...state, asked: state.asked + 1, lastAskedDay: today }, ask: true }
}

/** A fresh check result has just been shown. */
export function afterCheck(state: ReviewState, urgency: UrgencyLevel, today: string): Decision {
  return decide(state, isCalmResult(urgency), today)
}

/** The server has just accepted a «Дали». Counted either way; asked from the second one on. */
export function afterDoseGiven(state: ReviewState, today: string): Decision {
  const counted = { ...state, dosesGiven: state.dosesGiven + 1 }
  return decide(counted, counted.dosesGiven >= DOSES_BEFORE_ASKING, today)
}
