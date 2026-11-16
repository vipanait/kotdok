import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { draftStorage } from '@/lib/supabase'
import { createRecentStore } from './recent'

/**
 * What the «Можно ли?» tab remembers on this phone, apart from the server's
 * answers: the recent queries (kept across restarts), and for this launch
 * the pet chosen last and the AI answers left today.
 *
 * The recent queries go where the check draft goes — the keychain store
 * whose `alwaysClear` names their key, so signing out removes them — because
 * what someone asked about their pet is theirs. The plain AsyncStorage the
 * plan named is not installed in this app, and adding a native module for ten
 * short strings is not worth a new build. The pet and the remainder live in
 * memory only, tied to the account.
 */
const recentStore = createRecentStore(draftStorage)

export function useRecentQueries(userId: string | null) {
  useEffect(() => {
    if (userId) void recentStore.load(userId)
  }, [userId])
  const recent = useSyncExternalStore(recentStore.subscribe, () => recentStore.get(userId))
  const remember = useCallback(
    (query: string) => {
      if (userId) void recentStore.remember(userId, query)
    },
    [userId],
  )
  return { recent, remember }
}

/** The pet chosen last, per account, for this launch: the tab opens on it again. */
let lastPet: { userId: string; petId: string } | null = null

export function lastPetFor(userId: string | null): string | null {
  return userId && lastPet?.userId === userId ? lastPet.petId : null
}

export function rememberPet(userId: string | null, petId: string): void {
  if (userId) lastPet = { userId, petId }
}

/**
 * AI answers left today, as the last answer said. The limiter only tells the
 * remainder while spending, so until an answer arrives the line says «up to
 * 10», and an answer that spent nothing (`null`: from the cache, or the
 * limiter could not be read) leaves the last known number standing.
 */
let remaining: { userId: string; left: number } | null = null
const listeners = new Set<() => void>()

export function noteAiRemaining(userId: string | null, left: number | null): void {
  if (!userId || left === null) return
  remaining = { userId, left }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAiRemaining(userId: string | null): number | null {
  const value = useSyncExternalStore(subscribe, () => remaining)
  return userId && value?.userId === userId ? value.left : null
}
