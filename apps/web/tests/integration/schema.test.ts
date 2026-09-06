import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { UnsafeDatabaseTargetError } from '../support/db-guard'
import { connect, resetFixtures, seedFixtures } from './fixtures'

let client: Client

beforeAll(async () => {
  client = await connect()
})

afterAll(async () => {
  await client?.end()
})

const REQUIRED_TABLES = [
  'api_rate_limits',
  'credit_ledger',
  'credit_transactions',
  'extra_check_requests',
  'packages',
  'payment_methods',
  'pets',
  'profiles',
  'symptom_checks',
  'transaction_status_events',
  'transactions',
  'user_feedback',
  'vet_knowledge',
]

const REQUIRED_FUNCTIONS = [
  'apply_refund',
  'apply_symptom_check_usage',
  'apply_transaction_success',
  'apply_transaction_terminal',
  'consume_rate_limit',
  'create_extra_check_request',
  'create_transaction',
  'handle_new_user',
  'mark_transaction_pending',
  'refund_symptom_check_usage',
  'resolve_extra_check_request',
  'search_vet_knowledge',
]

describe('migrated schema', () => {
  it('creates every table the tests rely on', async () => {
    const { rows } = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
    )

    expect(rows.map((row) => row.table_name)).toEqual(REQUIRED_TABLES)
  })

  it('enables row level security on every table', async () => {
    const { rows } = await client.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    )

    expect(rows.map((row) => row.relname)).toEqual([])
  })

  it('keeps the ownership foreign keys', async () => {
    const { rows } = await client.query<{ definition: string }>(
      `select format('%s.%s -> %s', rel.relname, con.conname, pg_get_constraintdef(con.oid)) as definition
       from pg_constraint con
       join pg_class rel on rel.oid = con.conrelid
       join pg_namespace n on n.oid = rel.relnamespace
       where n.nspname = 'public' and con.contype = 'f'`,
    )
    const definitions = rows.map((row) => row.definition)

    expect(definitions).toContain('pets.cats_user_id_fkey -> FOREIGN KEY (user_id) REFERENCES profiles(id)')
    // Renaming cats -> pets kept the original constraint names; the live
    // database has the same ones.
    expect(definitions).toContain(
      'symptom_checks.symptom_checks_cat_id_fkey -> FOREIGN KEY (pet_id) REFERENCES pets(id)',
    )
    // Stage 8 has to deal with these: they block deleting a user outright.
    expect(definitions).toContain(
      'credit_ledger.credit_ledger_user_id_fkey -> FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT',
    )
    expect(definitions).toContain(
      'transactions.transactions_user_id_fkey -> FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT',
    )
  })

  it('creates every billing and triage function', async () => {
    const { rows } = await client.query<{ proname: string }>(
      `select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       order by p.proname`,
    )

    expect(rows.map((row) => row.proname)).toEqual(REQUIRED_FUNCTIONS)
  })

  it('gives user-facing roles read access but no direct writes', async () => {
    const { rows } = await client.query<{ grantee: string; table_name: string; privs: string }>(
      `select grantee, table_name, string_agg(privilege_type, ',' order by privilege_type) as privs
       from information_schema.role_table_grants
       where table_schema = 'public' and grantee in ('anon', 'authenticated')
       group by grantee, table_name
       order by table_name, grantee`,
    )

    // Every public table is reachable for reads — RLS decides which rows — and
    // no table may be written with a user token. Hosted Supabase grants all
    // privileges by default, which let a signed-in user set their own credits
    // and role through PostgREST until the lockdown migration.
    expect(rows).not.toHaveLength(0)
    for (const row of rows) {
      expect(row.privs, `${row.grantee} on ${row.table_name}`).toBe('SELECT')
    }

    // Every table is readable under RLS except the rate limit counters, which
    // would expose one user's request pattern to another.
    const covered = new Set(rows.map((row) => row.table_name))
    for (const table of REQUIRED_TABLES) {
      expect(covered.has(table), table).toBe(table !== 'api_rate_limits')
    }
  })

  it('keeps the account lifecycle column server-owned', async () => {
    const { rows } = await client.query<{ definition: string }>(
      `select pg_get_constraintdef(con.oid) as definition
       from pg_constraint con join pg_class rel on rel.oid = con.conrelid
       join pg_namespace n on n.oid = rel.relnamespace
       where n.nspname = 'public' and rel.relname = 'profiles' and con.conname = 'profiles_status_check'`,
    )

    expect(rows[0]?.definition).toContain("'active'")
    expect(rows[0]?.definition).toContain("'deleting'")
  })

  it('creates a profile for every new auth user', async () => {
    const { rows } = await client.query<{ tgname: string }>(
      `select t.tgname from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal`,
    )

    expect(rows.map((row) => row.tgname)).toContain('on_auth_user_created')
  })
})

describe('destructive reset guard on the live stack', () => {
  it('empties the allowed disposable database', async () => {
    await seedFixtures(client)
    await resetFixtures(client)

    const { rows } = await client.query<{ pets: string; checks: string; users: string }>(
      `select (select count(*) from public.pets) as pets,
              (select count(*) from public.symptom_checks) as checks,
              (select count(*) from auth.users) as users`,
    )

    expect(rows[0]).toEqual({ pets: '0', checks: '0', users: '0' })
  })

  it('refuses a hosted project even when the local stack is reachable', async () => {
    await expect(
      resetFixtures(client, { ...process.env, TEST_SUPABASE_URL: 'https://example.supabase.co' }),
    ).rejects.toThrow(UnsafeDatabaseTargetError)
  })
})
