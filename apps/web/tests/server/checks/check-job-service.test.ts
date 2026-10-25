import { describe, expect, it, vi } from 'vitest'
import { getCheckJob } from '@/server/checks/check-job-service'

// The analysis and the photo stores are not what is under test; keeping them
// out means no model key and no storage client are needed to load the module.
vi.mock('@/server/symptom-check/analyze-symptom-check', () => ({ analyzeSymptomCheck: vi.fn() }))
vi.mock('@/server/uploads/photo-attach', () => ({ loadPhotosForCheck: vi.fn() }))
vi.mock('@/server/uploads/photo-storage', () => ({ removeUploads: vi.fn() }))

const USER = '11111111-1111-4111-8111-000000000001'
const JOB = '11111111-1111-4111-8111-000000000777'
const NOW = new Date('2026-10-25T12:10:00.000Z')

function supabaseWith(row: Record<string, unknown>) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
  }
  return { from: vi.fn(() => builder) } as never
}

/** A row as the database hands it back: timestamps without a zone, in UTC. */
function job(status: string, updatedAt: string) {
  return { id: JOB, status, check_id: null, error_code: null, created_at: '2026-10-25 12:00:00', updated_at: updatedAt }
}

describe('reading a check job', () => {
  it('reports a job still processing after five minutes as failed: the analysis cannot run that long', async () => {
    const read = await getCheckJob(supabaseWith(job('processing', '2026-10-25 12:04:59')), USER, JOB, NOW)

    expect(read).toMatchObject({ job_id: JOB, status: 'failed', error_code: 'internal_error' })
  })

  it('leaves a job that has been processing for two minutes alone', async () => {
    const read = await getCheckJob(supabaseWith(job('processing', '2026-10-25 12:08:00')), USER, JOB, NOW)

    expect(read).toMatchObject({ status: 'processing', error_code: null })
  })

  it('leaves a finished job alone however old it is', async () => {
    const read = await getCheckJob(supabaseWith(job('completed', '2026-10-25 11:00:00')), USER, JOB, NOW)

    expect(read).toMatchObject({ status: 'completed', error_code: null })
  })
})
