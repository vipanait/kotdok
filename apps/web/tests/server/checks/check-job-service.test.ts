import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCheckJob, PROCESSING_STALE_MS } from '@/server/checks/check-job-service'

// The analysis and the photo stores are not what is under test; keeping them
// out means no model key and no storage client are needed to load the module.
vi.mock('@/server/symptom-check/analyze-symptom-check', () => ({ analyzeSymptomCheck: vi.fn() }))
vi.mock('@/server/uploads/photo-attach', () => ({ loadPhotosForCheck: vi.fn() }))
vi.mock('@/server/uploads/photo-storage', () => ({ removeUploads: vi.fn() }))

const USER = '11111111-1111-4111-8111-000000000001'
const JOB = '11111111-1111-4111-8111-000000000777'
const NOW = new Date('2026-10-25T12:10:00.000Z')

type Rpc = { data: unknown; error: { message: string } | null }

function supabaseWith(row: Record<string, unknown>, rpcAnswer: Rpc = { data: 'failed', error: null }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
  }
  const rpc = vi.fn(async () => rpcAnswer)
  return { client: { from: vi.fn(() => builder), rpc } as never, rpc }
}

/** A row as the database hands it back: timestamps without a zone, in UTC. */
function job(status: string, updatedAt: string) {
  return { id: JOB, status, check_id: null, error_code: null, created_at: '2026-10-25 12:00:00', updated_at: updatedAt }
}

afterEach(() => vi.restoreAllMocks())

describe('reading a check job', () => {
  it('closes a job still processing after five minutes, returning its credit, and reports it failed', async () => {
    const { client, rpc } = supabaseWith(job('processing', '2026-10-25 12:04:59'))

    const read = await getCheckJob(client, USER, JOB, NOW)

    // The database decides, under the job's lock, so two polls at once refund once.
    expect(rpc).toHaveBeenCalledWith('fail_stale_check_job', {
      p_user_id: USER,
      p_job_id: JOB,
      p_stale_after_seconds: PROCESSING_STALE_MS / 1000,
    })
    expect(read).toMatchObject({ job_id: JOB, status: 'failed', error_code: 'internal_error' })
  })

  it('believes the database when it finds the job not stale yet (its clock, not ours)', async () => {
    const { client } = supabaseWith(job('processing', '2026-10-25 12:04:59'), { data: 'processing', error: null })

    const read = await getCheckJob(client, USER, JOB, NOW)

    expect(read).toMatchObject({ status: 'processing', error_code: null })
  })

  it('still reports the job failed when closing it fails, so the phone stops waiting', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = supabaseWith(job('processing', '2026-10-25 12:04:59'), { data: null, error: { message: 'boom' } })

    const read = await getCheckJob(client, USER, JOB, NOW)

    expect(read).toMatchObject({ status: 'failed', error_code: 'internal_error' })
    expect(log).toHaveBeenCalled()
  })

  it('leaves a job that has been processing for two minutes alone', async () => {
    const { client, rpc } = supabaseWith(job('processing', '2026-10-25 12:08:00'))

    const read = await getCheckJob(client, USER, JOB, NOW)

    expect(read).toMatchObject({ status: 'processing', error_code: null })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('leaves a finished job alone however old it is', async () => {
    const { client, rpc } = supabaseWith(job('completed', '2026-10-25 11:00:00'))

    const read = await getCheckJob(client, USER, JOB, NOW)

    expect(read).toMatchObject({ status: 'completed', error_code: null })
    expect(rpc).not.toHaveBeenCalled()
  })
})
