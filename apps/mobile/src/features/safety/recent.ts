/**
 * The last questions asked in «Можно ли?», kept on this phone only
 * (docs/superpowers/specs/2026-11-13-pet-safety-design.md, «Приложение»):
 * the server keeps no history of them.
 *
 * Stored like the symptom check draft — with the account's id, so a shared
 * phone never shows one person's questions to another.
 */

import { normalizeSafetyQuery } from '@lapka/shared'

export const RECENT_KEY = 'lapka.safety-recent'
export const RECENT_MAX = 10

/**
 * The query first, without an earlier copy of it (compared normalised, so
 * «Шоколад » lifts «шоколад»), at most ten. The new spelling wins: it is
 * the one the person typed last.
 */
export function addRecent(list: readonly string[], query: string): string[] {
  const key = normalizeSafetyQuery(query)
  if (!key) return [...list]
  const rest = list.filter((item) => normalizeSafetyQuery(item) !== key)
  return [query.trim(), ...rest].slice(0, RECENT_MAX)
}

export function serialiseRecent(userId: string, queries: readonly string[]): string {
  return JSON.stringify({ userId, queries })
}

/** This account's queries, or none: a value from another account or an older app is dropped, not trusted. */
export function parseRecent(raw: string | null, userId: string): string[] {
  if (!raw) return []
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return []
  }
  if (typeof value !== 'object' || value === null) return []
  const record = value as Record<string, unknown>
  if (record.userId !== userId || !Array.isArray(record.queries)) return []
  return record.queries.filter((query): query is string => typeof query === 'string' && query.trim().length > 0).slice(0, RECENT_MAX)
}

type Storage = {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
}

const NONE: readonly string[] = []

/**
 * One list for the whole app, so every screen that remembers a query sees
 * the others' — a list per screen let the search overwrite a query the AI
 * screen had just stored. Read once per account; a remember waits for that
 * read, so nothing remembered early is lost under what was stored. The
 * write happens after the list changes, never inside a state update.
 */
export function createRecentStore(storage: Storage) {
  let state: { userId: string; queries: readonly string[] } | null = null
  let reading: { userId: string; done: Promise<void> } | null = null
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((listener) => listener())

  function load(userId: string): Promise<void> {
    if (reading?.userId === userId) return reading.done
    const done = storage
      .getItem(RECENT_KEY)
      .catch(() => null)
      .then((raw) => {
        state = { userId, queries: parseRecent(raw, userId) }
        emit()
      })
    reading = { userId, done }
    return done
  }

  return {
    load,
    get: (userId: string | null): readonly string[] => (userId && state?.userId === userId ? state.queries : NONE),
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async remember(userId: string, query: string): Promise<void> {
      await load(userId)
      const queries = addRecent(state?.userId === userId ? state.queries : [], query)
      state = { userId, queries }
      emit()
      // A lost write is only a shorter list next launch.
      await storage.setItem(RECENT_KEY, serialiseRecent(userId, queries)).catch(() => {})
    },
  }
}
