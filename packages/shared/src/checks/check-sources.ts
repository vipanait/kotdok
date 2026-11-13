import { CHECK_SOURCES_MAX, CheckSourceSchema, type CheckSource } from '@lapka/contracts'

/**
 * The materials a stored check names as what its analysis relied on (SRC-01).
 *
 * They live inside `full_response`, whose shape the contract leaves open, so
 * nothing here trusts it: a check from before the sources has no such key, and
 * an entry that is not a source — or whose link is not `https` — is left out
 * rather than shown. Never throws: a result must open whatever is stored.
 */
export function checkSources(full: Record<string, unknown> | null): CheckSource[] {
  const stored = full?.sources
  if (!Array.isArray(stored)) return []

  const sources: CheckSource[] = []
  for (const entry of stored) {
    const parsed = CheckSourceSchema.safeParse(entry)
    if (parsed.success && parsed.data.url.startsWith('https://')) sources.push(parsed.data)
    if (sources.length === CHECK_SOURCES_MAX) break
  }
  return sources
}
