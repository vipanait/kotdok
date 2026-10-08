import type { SecureStorage } from '@/lib/session-storage'

const KEY = 'lapka.consent-known'

/**
 * Whose consent this phone has already seen the server confirm, and for which
 * edition of the text.
 *
 * The tabs used to wait for `getConsentStatus` on every launch before drawing
 * anything, cached pets included: a blank screen for a network round trip,
 * every time, to learn what was already known. With this they open at once for
 * a person the server has confirmed before, and the status is asked in the
 * background.
 *
 * It decides nothing about access. The server refuses with `consent_required`
 * whatever this says, and that refusal opens the consent screen — so a stale
 * entry costs a moment of tabs before the consent screen, never a skipped one.
 * A new edition of the text is a different value, and is not known.
 */
export function createConsentMemory(storage: SecureStorage, version: string) {
  const entry = (userId: string) => `${userId}:${version}`

  return {
    async knows(userId: string): Promise<boolean> {
      try {
        return (await storage.getItemAsync(KEY)) === entry(userId)
      } catch {
        return false
      }
    },
    /** Only after the server said nothing is owed: a failed read proves nothing. */
    async remember(userId: string): Promise<void> {
      await storage.setItemAsync(KEY, entry(userId)).catch(() => {})
    },
    async forget(): Promise<void> {
      await storage.deleteItemAsync(KEY).catch(() => {})
    },
  }
}

export type ConsentMemory = ReturnType<typeof createConsentMemory>
