/**
 * Normalises a database timestamp to UTC ISO 8601 with an offset, which is what
 * every date crossing the API must look like.
 *
 * Several columns are `timestamp without time zone` and come back as
 * `2026-05-01T10:00:00` — no zone at all. They were written by `now()` on a UTC
 * server, so the missing zone is UTC; saying so explicitly keeps a client from
 * reading them in its own local time.
 */
export function toUtcIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString()

  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
  return new Date(hasZone ? value : `${value}Z`).toISOString()
}
