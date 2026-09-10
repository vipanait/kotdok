import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServiceClient } from '@/server/supabase/server'
import { getAdminStatistics, normalizeAdminStatisticsPeriod } from '@/server/admin/statistics'

vi.mock('@/server/supabase/server', () => ({ createServiceClient: vi.fn() }))

describe('admin statistics service', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-02T12:00:00.000Z'))
    vi.mocked(createServiceClient).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('normalizes supported periods', () => {
    expect(normalizeAdminStatisticsPeriod('7')).toBe(7)
    expect(normalizeAdminStatisticsPeriod('30')).toBe(30)
    expect(normalizeAdminStatisticsPeriod(['90'])).toBe(90)
  })

  it('falls back to 30 days for unsupported periods', () => {
    expect(normalizeAdminStatisticsPeriod('14')).toBe(30)
    expect(normalizeAdminStatisticsPeriod(undefined)).toBe(30)
    expect(normalizeAdminStatisticsPeriod('bad')).toBe(30)
  })

  it('loads source rows and aggregates statistics in code', async () => {
    const service = createStatisticsServiceMock({
      profiles: [
        { id: 'user-1', created_at: '2026-05-01T10:00:00.000Z' },
        { id: 'user-2', created_at: '2026-04-20T10:00:00.000Z' },
      ],
      symptomChecks: [
        { user_id: 'user-1', created_at: '2026-05-02T10:00:00.000Z', pet_id: 'pet-cat' },
        { user_id: 'user-1', created_at: '2026-05-02T11:00:00.000Z', pet_id: 'pet-dog' },
        { user_id: 'user-2', created_at: '2026-04-19T10:00:00.000Z', pet_id: 'pet-cat' },
      ],
      pets: [
        { id: 'pet-cat', species: 'cat' },
        { id: 'pet-dog', species: 'dog' },
      ],
    })
    vi.mocked(createServiceClient).mockReturnValue(service as never)

    await expect(getAdminStatistics(7)).resolves.toEqual({
      days: 7,
      totals: {
        registeredUsers: 2,
        symptomCheckUsers: 2,
        symptomChecks: 3,
        symptomChecksCat: 2,
        symptomChecksDog: 1,
        petsTotal: 2,
        petsCat: 1,
        petsDog: 1,
      },
      daily: [
        { date: '2026-04-26', registrations: 0, symptomChecks: 0, symptomChecksCat: 0, symptomChecksDog: 0 },
        { date: '2026-04-27', registrations: 0, symptomChecks: 0, symptomChecksCat: 0, symptomChecksDog: 0 },
        { date: '2026-04-28', registrations: 0, symptomChecks: 0, symptomChecksCat: 0, symptomChecksDog: 0 },
        { date: '2026-04-29', registrations: 0, symptomChecks: 0, symptomChecksCat: 0, symptomChecksDog: 0 },
        { date: '2026-04-30', registrations: 0, symptomChecks: 0, symptomChecksCat: 0, symptomChecksDog: 0 },
        { date: '2026-05-01', registrations: 1, symptomChecks: 0, symptomChecksCat: 0, symptomChecksDog: 0 },
        { date: '2026-05-02', registrations: 0, symptomChecks: 2, symptomChecksCat: 1, symptomChecksDog: 1 },
      ],
    })
    expect(service.from).toHaveBeenCalledWith('profiles')
    expect(service.from).toHaveBeenCalledWith('symptom_checks')
    expect(service.from).toHaveBeenCalledWith('pets')
    // Payments are gone from the product, and the dashboard must not go looking
    // for tables that no longer exist.
    expect(service.from).not.toHaveBeenCalledWith('transactions')
    expect(service.from).not.toHaveBeenCalledWith('transaction_status_events')
  })

  it('throws when a source query returns an error', async () => {
    const service = createStatisticsServiceMock({
      profilesError: { message: 'boom' },
    })
    vi.mocked(createServiceClient).mockReturnValue(service as never)

    await expect(getAdminStatistics(30)).rejects.toThrow('Failed to load admin statistics profiles: boom')
  })
})

function createStatisticsServiceMock({
  profiles = [],
  symptomChecks = [],
  pets = [],
  profilesError = null,
}: {
  profiles?: unknown[]
  symptomChecks?: unknown[]
  pets?: unknown[]
  profilesError?: { message: string } | null
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockResolvedValue({ data: profiles, error: profilesError }),
        }
      }
      if (table === 'symptom_checks') {
        return {
          select: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ data: symptomChecks, error: null }),
          }),
        }
      }
      if (table === 'pets') {
        return {
          select: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ data: pets, error: null }),
          }),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}
