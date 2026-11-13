import { allEntries } from '@/features/safety/load'
import type { SafetyEntry } from '@/features/safety/schema'

type Status = SafetyEntry['review']['status']

/**
 * Runs `run` with every reference entry in the review status `status` gives
 * it, then puts the real statuses back. The loader caches the parsed files,
 * so a status set in that cache is the status the pages, the hub and the
 * sitemap see — the tests then hold whatever the content files say today
 * (all drafts, all reviewed, some published).
 */
export async function withReviewStatus<T>(status: (entry: SafetyEntry) => Status, run: () => T | Promise<T>): Promise<T> {
  const entries = allEntries()
  const saved = entries.map(entry => entry.review)
  for (const entry of entries) {
    const next = status(entry)
    // A published entry always has a review date (the sitemap reads it).
    entry.review = { ...entry.review, status: next, ...(next === 'published' ? { reviewedAt: entry.review.reviewedAt ?? '2026-11-13' } : {}) }
  }
  try {
    return await run()
  } finally {
    entries.forEach((entry, i) => (entry.review = saved[i]))
  }
}

/** Only `slug` published; every other entry left unpublished as `rest`. */
export const onlyPublished = (slug: string, rest: Status = 'agent_reviewed') => (entry: SafetyEntry): Status =>
  entry.slug === slug ? 'published' : rest

/** Nothing published. */
export const nonePublished = (status: Status = 'agent_reviewed') => (): Status => status
