import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServiceClient } from '@/server/supabase/server'
import {
  getAdminCheckFeed,
  getAdminChecks,
  getAdminFeedbackFeed,
  getAdminOverview,
  getAdminUsers,
  mapFollowupStatistics,
  normalizeAdminStatisticsPeriod,
  normalizeCheckFeedFilter,
  normalizeFeedbackFeedFilter,
  normalizeFeedShown,
} from '@/server/admin/statistics'

vi.mock('@/server/supabase/server', () => ({ createServiceClient: vi.fn() }))

const NOW = new Date('2026-05-02T12:00:00.000Z')

/** A service client whose `rpc` answers by function name. */
function serviceAnswering(answers: Record<string, { data?: unknown; error?: { message: string } | null }>) {
  const rpc = vi.fn(async (name: string) => {
    const answer = answers[name]
    if (!answer) throw new Error(`unexpected rpc ${name}`)
    return { data: answer.data ?? null, error: answer.error ?? null }
  })
  vi.mocked(createServiceClient).mockReturnValue({ rpc } as never)
  return rpc
}

describe('admin statistics over SQL', () => {
  beforeEach(() => {
    vi.mocked(createServiceClient).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('normalizes feed parameters', () => {
    expect(normalizeFeedShown('99999')).toBe(500)
    expect(normalizeFeedShown('-1')).toBe(50)
    expect(normalizeFeedShown('120')).toBe(100)
    expect(normalizeFeedShown(['150'])).toBe(150)
    expect(normalizeFeedShown(undefined)).toBe(50)
    expect(normalizeFeedShown('abc')).toBe(50)
    expect(normalizeCheckFeedFilter('<script>')).toBe('all')
    expect(normalizeCheckFeedFilter('urgent')).toBe('urgent')
    expect(normalizeCheckFeedFilter('liked')).toBe('all')
    expect(normalizeFeedbackFeedFilter('liked')).toBe('liked')
    expect(normalizeFeedbackFeedFilter('urgent')).toBe('all')
    expect(normalizeAdminStatisticsPeriod('14')).toBe(30)
  })

  it('calls admin_overview_stats with now and the period', async () => {
    const rpc = serviceAnswering({
      admin_overview_stats: {
        data: {
          new_users: { cur: 3, prev: 1 },
          active_7d: { cur: 2, prev: null },
          checks: { cur: 5, prev: 4 },
          helpful: { cur: { num: 4, den: 5 }, prev: null },
          failures: { cur: { num: 0, den: 5 }, prev: { num: 1, den: 4 } },
          extra_requests: { cur: 1, prev: 0 },
          daily: [{ date: '2026-05-02', registrations: 1, checks: 2 }],
        },
      },
    })
    const overview = await getAdminOverview(7, NOW)
    expect(rpc).toHaveBeenCalledWith('admin_overview_stats', { p_now: '2026-05-02T12:00:00.000Z', p_days: 7 })
    expect(overview).toMatchObject({
      days: 7,
      newUsers: { cur: 3, prev: 1 },
      active7d: { cur: 2, prev: null },
      helpful: { cur: { num: 4, den: 5 }, prev: null },
      extraRequests: { cur: 1, prev: 0 },
      daily: [{ date: '2026-05-02', registrations: 1, checks: 2 }],
    })
  })

  it('maps a null prev, missing counts and the questionnaire keys', async () => {
    serviceAnswering({
      admin_checks_stats: {
        data: {
          checks: { cur: 3, prev: null },
          species: { cat: 2 },
          answers: { total: 3, duration: { '2-3days': 1, 'week+': 2 }, pain: { touch_sensitive: 1, any: 1 } },
          failure_codes: { analysis_failed: 2 },
        },
      },
      admin_followup_statistics: { data: { by_urgency: [], first_source: {} } },
    })
    const checks = await getAdminChecks(30, NOW)
    expect(checks.checks).toEqual({ cur: 3, prev: null })
    expect(checks.species).toEqual({ cat: 2, dog: 0, unknown: 0 })
    expect(checks.perUser).toEqual({ cur: { num: 0, den: 0 }, prev: null })
    expect(checks.answers.duration).toEqual({ today: 0, '2-3days': 1, '4-7days': 0, 'week+': 2, unanswered: 0 })
    expect(checks.answers.pain.touch_sensitive).toBe(1)
    expect(checks.failureCodes).toEqual({ analysis_failed: 2 })
    expect(checks.daily).toEqual([])
  })

  it('loads the follow-up loop with the checks', async () => {
    const rpc = serviceAnswering({
      admin_checks_stats: { data: {} },
      admin_followup_statistics: { data: { by_urgency: [], first_source: { notification: 1 } } },
    })
    const checks = await getAdminChecks(7, NOW)
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc).toHaveBeenCalledWith('admin_followup_statistics', {
      p_from: '2026-04-25T12:00:00.000Z',
      p_to: '2026-05-03T12:00:00.000Z',
    })
    expect(checks.followup.rows).toHaveLength(4)
    expect(checks.followup.firstSource).toEqual({ notification: 1 })
  })

  it('maps users, cohorts with empty weeks included', async () => {
    serviceAnswering({
      admin_users_stats: {
        data: {
          accounts: { total: 10, added: 2 },
          dau_avg: { cur: 0.1, prev: null },
          providers: { apple: 3, 'custom:yandex': 1 },
          locales: { ru: 4 },
          cohorts: [{ week_start: '2026-04-27', size: 2, active: [1, null, null, null, null] }],
        },
      },
    })
    const users = await getAdminUsers(30, NOW)
    expect(users.accounts).toEqual({ total: 10, added: 2 })
    expect(users.dauAvg).toEqual({ cur: 0.1, prev: null })
    expect(users.providers).toEqual({ apple: 3, 'custom:yandex': 1 })
    expect(users.cohorts).toEqual([{ weekStart: '2026-04-27', size: 2, active: [1, null, null, null, null] }])
  })

  it('maps feed rows, with or without a check', async () => {
    const rpc = serviceAnswering({
      admin_feedback_feed: {
        data: {
          rows: [
            { id: 'f1', at: '2026-05-01T10:00:00+00:00', rating: 'liked', comment: 'спасибо', check: null },
            {
              id: 'f2',
              at: '2026-05-01T09:00:00+00:00',
              rating: 'disliked',
              comment: 'мимо',
              check: {
                id: 'c1',
                created_at: '2026-05-01T08:00:00+00:00',
                species: 'cat',
                pet_age_years: 3,
                symptoms: 'рвота',
                urgency: 'urgent',
                urgency_reason: 'r',
                possible_causes: ['a'],
                home_care_steps: [],
                vet_questions: ['q'],
                answers: { appetite: 'none', activity: null, duration: null, stool: null, pain_signs: ['tense'] },
                rating: 'disliked',
                comment: 'мимо',
              },
            },
          ],
          has_more: true,
        },
      },
    })
    const feed = await getAdminFeedbackFeed(30, 'disliked', 100, NOW)
    expect(rpc).toHaveBeenCalledWith('admin_feedback_feed', { p_now: '2026-05-02T12:00:00.000Z', p_days: 30, p_filter: 'disliked', p_limit: 100 })
    expect(feed.hasMore).toBe(true)
    expect(feed.rows[0]!.check).toBeNull()
    expect(feed.rows[1]!.check).toMatchObject({
      createdAt: '2026-05-01T08:00:00+00:00',
      petAgeYears: 3,
      urgencyReason: 'r',
      possibleCauses: ['a'],
      answers: { appetite: 'none', painSigns: ['tense'] },
    })
  })

  it('passes the check feed filter and size through', async () => {
    const rpc = serviceAnswering({ admin_check_feed: { data: { rows: [], has_more: false } } })
    const feed = await getAdminCheckFeed(90, 'urgent', 50, NOW)
    expect(rpc).toHaveBeenCalledWith('admin_check_feed', { p_now: '2026-05-02T12:00:00.000Z', p_days: 90, p_filter: 'urgent', p_limit: 50 })
    expect(feed).toEqual({ rows: [], hasMore: false })
  })

  it('maps the follow-up aggregates in the order of the scale, with every urgency present', () => {
    const mapped = mapFollowupStatistics({
      by_urgency: [
        { urgency: 'home_care', offered: 12, enabled: 11, answered: 9, first_worse: 3, any_worse: 4, median_hours_to_better: 30.25 },
      ],
      first_source: { notification: 6, web_banner: 3 },
    })
    expect(mapped.rows.map(row => row.urgency)).toEqual(['monitor', 'home_care', 'urgent', 'emergency'])
    expect(mapped.rows[1]).toMatchObject({ offered: 12, enabled: 11, answered: 9, firstWorse: 3, anyWorse: 4, medianHoursToBetter: 30.3 })
    expect(mapped.rows[0]).toMatchObject({ offered: 0, medianHoursToBetter: null })
    expect(mapped.firstSource).toEqual({ notification: 6, web_banner: 3 })
  })

  it('throws when a function fails', async () => {
    serviceAnswering({ admin_users_stats: { error: { message: 'boom' } } })
    await expect(getAdminUsers(30, NOW)).rejects.toThrow('Failed to load admin statistics admin_users_stats: boom')
  })
})
