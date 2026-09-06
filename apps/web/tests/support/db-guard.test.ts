import { describe, expect, it, vi } from 'vitest'
import {
  UnsafeDatabaseTargetError,
  assertDisposableDatabase,
  resetDisposableDatabase,
} from './db-guard'

const localEnv = {
  TEST_DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  TEST_SUPABASE_URL: 'http://127.0.0.1:54321',
  ALLOW_DESTRUCTIVE_DB_RESET: 'true',
}

describe('disposable database guard', () => {
  it('accepts the explicitly allowed local stack', () => {
    expect(assertDisposableDatabase(localEnv)).toEqual({
      databaseUrl: localEnv.TEST_DATABASE_URL,
      supabaseUrl: localEnv.TEST_SUPABASE_URL,
    })
  })

  it.each([
    ['missing database url', { ...localEnv, TEST_DATABASE_URL: undefined }, 'missing_database_url'],
    ['missing supabase url', { ...localEnv, TEST_SUPABASE_URL: undefined }, 'missing_supabase_url'],
    ['missing opt-in', { ...localEnv, ALLOW_DESTRUCTIVE_DB_RESET: undefined }, 'reset_not_allowed'],
    ['unparsable url', { ...localEnv, TEST_DATABASE_URL: 'not-a-url' }, 'unparsable_database_url'],
    [
      'remote staging host',
      { ...localEnv, TEST_DATABASE_URL: 'postgresql://postgres:pw@db.stagingref.supabase.co:5432/postgres' },
      'non_local_database_host',
    ],
    [
      'unexpected local port',
      { ...localEnv, TEST_DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/postgres' },
      'unexpected_database_port',
    ],
    [
      'hosted supabase project ref',
      { ...localEnv, TEST_SUPABASE_URL: 'https://bczseshsgpzulqynvukg.supabase.co' },
      'non_local_supabase_url',
    ],
  ])('refuses %s', (_name, env, code) => {
    expect(() => assertDisposableDatabase(env)).toThrow(UnsafeDatabaseTargetError)
    expect(() => assertDisposableDatabase(env)).toThrow(code)
  })

  it('refuses before issuing any statement', async () => {
    const execute = vi.fn()

    await expect(
      resetDisposableDatabase({ execute }, { ...localEnv, TEST_SUPABASE_URL: 'https://bczseshsgpzulqynvukg.supabase.co' }),
    ).rejects.toThrow(UnsafeDatabaseTargetError)

    expect(execute).not.toHaveBeenCalled()
  })

  it('truncates only application tables on an allowed target', async () => {
    const execute = vi.fn().mockResolvedValue(undefined)

    await resetDisposableDatabase({ execute }, localEnv)

    expect(execute).toHaveBeenCalledTimes(1)
    const [statement] = execute.mock.calls[0]
    expect(statement).toContain('truncate table')
    expect(statement).toContain('public.symptom_checks')
    expect(statement).not.toContain('drop ')
  })
})
