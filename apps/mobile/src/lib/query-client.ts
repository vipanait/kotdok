import { File, Paths } from 'expo-file-system'
import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { STALE_MS } from './query-freshness'
import { persisted } from './query-keys'

/**
 * What the app last loaded, shown at once when a screen opens again.
 *
 * Every screen used to wait for the network on every visit, with a skeleton
 * in the meantime — about a second a screen with the database where it is.
 * Now a screen seen before shows what it showed last time and refreshes in
 * the background; the screen's own rules about errors stay as they were (a
 * failed refresh leaves the last answer on screen, with the error banner).
 *
 * An answer is shown for half a minute without asking again (`STALE_MS`):
 * a screen left and come back to shows what it showed. A save marks what it
 * moved (`useRecordChanged`), so that is read again at once; anything older
 * is read again on focus (`useCached`).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The screens say what failed and offer «Повторить»; a silent retry would
      // only make that wait three times longer.
      retry: false,
      staleTime: STALE_MS,
      // Kept a day in memory and on disk, so the first screen after a restart
      // is not blank either.
      gcTime: 24 * 60 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
    },
  },
})

/**
 * The cache on disk: one JSON file in the app's caches folder, which the
 * system may empty under pressure (that only costs one slow screen). It holds
 * the account's own records, so it is removed on sign-out with the session.
 */
const cacheFile = () => new File(Paths.cache, 'lapka-query-cache.json')

const fileStorage = {
  getItem: async () => {
    const file = cacheFile()
    return file.exists ? file.text() : null
  },
  setItem: async (_key: string, value: string) => {
    const file = cacheFile()
    if (!file.exists) file.create()
    file.write(value)
  },
  removeItem: async () => {
    const file = cacheFile()
    if (file.exists) file.delete()
  },
}

export const cachePersister = createAsyncStoragePersister({ storage: fileStorage, throttleTime: 1000 })

/**
 * The lists and the records are kept on disk, also when their latest refresh
 * failed: a refresh that did not get through is no reason to forget what was
 * there. Not the checks, each with the model's whole answer, nor a day's
 * doses and summaries (`persisted`): the file is rewritten whole after every
 * change, on the JavaScript thread.
 */
export const persistOptions = {
  persister: cachePersister,
  maxAge: 24 * 60 * 60 * 1000,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { queryKey: readonly unknown[]; state: { data: unknown } }) =>
      query.state.data !== undefined && persisted(query.queryKey),
  },
}

/** Dropped with the session: the next account on this phone must not see this one's pets. */
export async function forgetCache(): Promise<void> {
  queryClient.clear()
  await cachePersister.removeClient()
}
