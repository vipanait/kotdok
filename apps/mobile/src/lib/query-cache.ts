import { useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { useAuth } from '@/providers/AuthProvider'
import { STALE_MS, needsRefetch } from './query-freshness'
import { scoped, type CacheKey } from './query-keys'

/**
 * Load through the cache: the last answer at once, a fresh one when it is
 * older than `STALE_MS`, has been invalidated by a save, or the screen asks.
 *
 * Coming back to a screen within half a minute shows what it showed and asks
 * nothing; a save goes through `useInvalidate` (or `useRecordChanged`), which
 * marks what it moved so the next focus reads it again. Every screen of one
 * pet reads its record under one key, so one answer serves them all.
 *
 * Keys are scoped to the signed-in user as well, so nothing one account
 * loaded can be read back under another, even if clearing ever failed.
 */
export function useCached<T>(key: CacheKey, load: () => Promise<T>) {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const client = useQueryClient()
  const queryKey = scoped(userId ?? '', key)
  const query = useQuery({
    queryKey,
    queryFn: load,
    enabled: userId !== null,
    staleTime: STALE_MS,
  })
  const { refetch } = query
  const reload = useCallback(() => refetch({ cancelRefetch: false }), [refetch])

  useFocusEffect(
    useCallback(() => {
      if (!userId) return
      // A request already running is joined, not started again.
      if (needsRefetch(client.getQueryState(queryKey), Date.now())) void refetch({ cancelRefetch: false })
      // The key's parts are what matters, not the array built on this render.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client, refetch, userId, JSON.stringify(key)]),
  )

  return {
    data: query.data ?? null,
    /** The last failure, cleared by the next success; the cached data stays alongside it. */
    error: query.error,
    /** A request is on its way, cached data or not. */
    fetching: query.isFetching,
    reload,
  }
}

/**
 * Marks what a change on the server moved: every screen showing one of these
 * keys reads it again — at once if it is on screen, on its next focus if not.
 */
export function useInvalidate() {
  const client = useQueryClient()
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  return useCallback(
    (keys: readonly CacheKey[]): Promise<void> => {
      if (!userId) return Promise.resolve()
      return Promise.all(keys.map((key) => client.invalidateQueries({ queryKey: scoped(userId, key) }))).then(() => undefined)
    },
    [client, userId],
  )
}

/**
 * Reads one answer through the cache from outside a hook's render: a form
 * building its draft, a sync planning the week. What the cache holds, when
 * fresher than `staleMs`; the server otherwise, and the cache keeps that.
 */
export function useCacheReader() {
  const client = useQueryClient()
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  return useCallback(
    <T,>(key: CacheKey, load: () => Promise<T>, staleMs: number = STALE_MS): Promise<T> =>
      client.fetchQuery({ queryKey: scoped(userId ?? '', key), queryFn: load, staleTime: staleMs }),
    [client, userId],
  )
}

/**
 * Put records already in hand under their own keys, so the screen that opens
 * one shows it at once instead of asking again: the history page carries the
 * whole check that its result screen would load.
 */
export function useSeedCache() {
  const client = useQueryClient()
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  return useCallback(
    (entries: ReadonlyArray<readonly [key: CacheKey, value: unknown]>) => {
      if (!userId) return
      for (const [key, value] of entries) client.setQueryData(scoped(userId, key), value)
    },
    [client, userId],
  )
}
