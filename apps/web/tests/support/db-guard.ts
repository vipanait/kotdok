// Guard for destructive operations in the integration suite (plan item 0/05).
//
// The suite may only reset a database that is unmistakably the disposable local
// Supabase stack AND that the operator opted into. Anything else — an unknown
// address, a hosted project ref, staging, production — is refused before the
// first statement leaves the process.

export class UnsafeDatabaseTargetError extends Error {
  constructor(readonly code: string, message: string) {
    super(`${code}: ${message}`)
    this.name = 'UnsafeDatabaseTargetError'
  }
}

export type GuardEnv = {
  TEST_DATABASE_URL?: string
  TEST_SUPABASE_URL?: string
  ALLOW_DESTRUCTIVE_DB_RESET?: string
}

export type DisposableTarget = {
  databaseUrl: string
  supabaseUrl: string
}

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])
const LOCAL_DATABASE_PORTS = new Set(['54322'])
const LOCAL_API_PORTS = new Set(['54321'])

// Tables the fixtures own. `auth.users` is cleared through the Auth admin API,
// not here, so the trigger-created profiles stay consistent.
const TRUNCATED_TABLES = [
  'public.user_feedback',
  'public.extra_check_requests',
  'public.credit_ledger',
  'public.transaction_status_events',
  'public.transactions',
  'public.payment_methods',
  'public.credit_transactions',
  'public.symptom_checks',
  'public.pets',
  'public.profiles',
]

function parse(url: string, code: string): URL {
  try {
    return new URL(url)
  } catch {
    throw new UnsafeDatabaseTargetError(code, `cannot parse ${redact(url)}`)
  }
}

// Connection strings carry a password; never echo one back in an error.
function redact(url: string): string {
  return url.replace(/\/\/[^@/]*@/, '//<redacted>@')
}

export function assertDisposableDatabase(env: GuardEnv): DisposableTarget {
  const databaseUrl = env.TEST_DATABASE_URL
  if (!databaseUrl) {
    throw new UnsafeDatabaseTargetError('missing_database_url', 'TEST_DATABASE_URL is not set')
  }

  const supabaseUrl = env.TEST_SUPABASE_URL
  if (!supabaseUrl) {
    throw new UnsafeDatabaseTargetError('missing_supabase_url', 'TEST_SUPABASE_URL is not set')
  }

  if (env.ALLOW_DESTRUCTIVE_DB_RESET !== 'true') {
    throw new UnsafeDatabaseTargetError(
      'reset_not_allowed',
      'set ALLOW_DESTRUCTIVE_DB_RESET=true to allow resetting the disposable local database',
    )
  }

  const db = parse(databaseUrl, 'unparsable_database_url')
  if (!LOCAL_HOSTS.has(db.hostname)) {
    throw new UnsafeDatabaseTargetError('non_local_database_host', `refusing host ${db.hostname}`)
  }
  if (!LOCAL_DATABASE_PORTS.has(db.port)) {
    throw new UnsafeDatabaseTargetError('unexpected_database_port', `refusing port ${db.port || '(default)'}`)
  }

  const api = parse(supabaseUrl, 'unparsable_supabase_url')
  if (!LOCAL_HOSTS.has(api.hostname) || !LOCAL_API_PORTS.has(api.port)) {
    throw new UnsafeDatabaseTargetError('non_local_supabase_url', `refusing ${api.origin}`)
  }

  return { databaseUrl, supabaseUrl }
}

export type StatementRunner = {
  execute(statement: string): Promise<unknown>
}

export async function resetDisposableDatabase(
  runner: StatementRunner,
  env: GuardEnv,
): Promise<DisposableTarget> {
  const target = assertDisposableDatabase(env)

  await runner.execute(`truncate table ${TRUNCATED_TABLES.join(', ')} restart identity cascade`)

  return target
}
