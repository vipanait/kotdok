import { describe, expect, it } from 'vitest'
import { IsoDateTimeSchema } from '@lapka/contracts'
import { toUtcIso } from '@lapka/shared'

describe('normalising database timestamps', () => {
  it('treats a zone-less timestamp as UTC', () => {
    expect(toUtcIso('2026-05-01T10:00:00')).toBe('2026-05-01T10:00:00.000Z')
  })

  it('keeps an explicit zone', () => {
    expect(toUtcIso('2026-05-01T10:00:00+00:00')).toBe('2026-05-01T10:00:00.000Z')
    expect(toUtcIso('2026-05-01T13:00:00+03:00')).toBe('2026-05-01T10:00:00.000Z')
    expect(toUtcIso('2026-05-01T10:00:00Z')).toBe('2026-05-01T10:00:00.000Z')
  })

  it('accepts a Date', () => {
    expect(toUtcIso(new Date('2026-05-01T10:00:00Z'))).toBe('2026-05-01T10:00:00.000Z')
  })

  it('produces something the contract accepts', () => {
    for (const raw of ['2026-05-01T10:00:00', '2026-05-01T10:00:00+03:00']) {
      expect(IsoDateTimeSchema.parse(toUtcIso(raw))).toBe(toUtcIso(raw))
    }
  })

  it('rejects the raw zone-less form, which is why this exists', () => {
    expect(IsoDateTimeSchema.safeParse('2026-05-01T10:00:00').success).toBe(false)
  })
})
