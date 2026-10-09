import { useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { useAuth } from '@/providers/AuthProvider'

/**
 * Load through the cache: the last answer at once, a fresh one on every focus.
 *
 * Keys are scoped to the signed-in user as well, so nothing one account
 * loaded can be read back under another, even if clearing ever failed.
 */
export function useCached<T>(key: readonly unknown[], load: () => Promise<T>) {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const query = useQuery({
    queryKey: [userId, ...key],
    queryFn: load,
    // Never on its own: the focus effect below decides when to go to the network.
    enabled: false,
  })
  const { refetch } = query
  const reload = useCallback(() => refetch({ cancelRefetch: false }), [refetch])

  useFocusEffect(
    useCallback(() => {
      // A request already running is joined, not started again.
      if (userId) void refetch({ cancelRefetch: false })
    }, [refetch, userId]),
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
 * Put records already in hand under their own keys, so the screen that opens
 * one shows it at once instead of asking again: the history page carries the
 * whole check that its result screen would load.
 */
export function useSeedCache() {
  const client = useQueryClient()
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  return useCallback(
    (entries: ReadonlyArray<readonly [key: readonly unknown[], value: unknown]>) => {
      if (!userId) return
      for (const [key, value] of entries) client.setQueryData([userId, ...key], value)
    },
    [client, userId],
  )
}
