// Deterministic integration fixtures (plan item 0/03).
//
// Two unrelated owners, each with pets and symptom checks, different balances,
// credit movements that add up to those balances, and one billing transaction.
// Every business value is fixed; only the auth user ids are generated, because
// they come from the real Auth admin API rather than a hand-written insert.

import { createClient } from '@supabase/supabase-js'
import { Client } from 'pg'
import { assertDisposableDatabase, resetDisposableDatabase, type GuardEnv } from '../support/db-guard'

export const FIXTURE_PASSWORD = 'fixture-password-1'

export const OWNER_A = {
  email: 'owner-a@fixture.local',
  locale: 'ru' as const,
  role: 'user' as const,
  expectedCredits: 5,
}

export const OWNER_B = {
  email: 'owner-b@fixture.local',
  locale: 'en' as const,
  role: 'user' as const,
  expectedCredits: 1,
}

// Fixed ids so assertions and later stages can reference rows by name.
export const PET_IDS = {
  aCat: '11111111-1111-4111-8111-000000000001',
  aDog: '11111111-1111-4111-8111-000000000002',
  bCat: '22222222-2222-4222-8222-000000000001',
  bDeleted: '22222222-2222-4222-8222-000000000002',
} as const

export const CHECK_IDS = {
  aFirst: '11111111-1111-4111-8111-000000000101',
  aSecond: '11111111-1111-4111-8111-000000000102',
  bOnly: '22222222-2222-4222-8222-000000000101',
  bDeleted: '22222222-2222-4222-8222-000000000102',
} as const

export type SeededFixtures = {
  ownerAId: string
  ownerBId: string
}

function readEnv(env: NodeJS.ProcessEnv): GuardEnv & { TEST_SUPABASE_SERVICE_ROLE_KEY?: string } {
  return {
    TEST_DATABASE_URL: env.TEST_DATABASE_URL,
    TEST_SUPABASE_URL: env.TEST_SUPABASE_URL,
    ALLOW_DESTRUCTIVE_DB_RESET: env.ALLOW_DESTRUCTIVE_DB_RESET,
    TEST_SUPABASE_SERVICE_ROLE_KEY: env.TEST_SUPABASE_SERVICE_ROLE_KEY,
  }
}

export async function connect(env: NodeJS.ProcessEnv = process.env): Promise<Client> {
  const { databaseUrl } = assertDisposableDatabase(readEnv(env))
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  return client
}

function adminClient(env: NodeJS.ProcessEnv) {
  const config = readEnv(env)
  const key = config.TEST_SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('TEST_SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient(config.TEST_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Clears application rows, then the auth users the rows depended on. */
export async function resetFixtures(client: Client, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await resetDisposableDatabase(
    { execute: (statement) => client.query(statement) },
    readEnv(env),
  )

  const admin = adminClient(env)
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) throw error

  for (const user of data.users) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
    if (deleteError) throw deleteError
  }
}

async function createOwner(env: NodeJS.ProcessEnv, email: string): Promise<string> {
  const admin = adminClient(env)
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: FIXTURE_PASSWORD,
    email_confirm: true,
  })
  if (error) throw error
  return data.user.id
}

export async function seedFixtures(
  client: Client,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SeededFixtures> {
  await resetFixtures(client, env)

  const ownerAId = await createOwner(env, OWNER_A.email)
  const ownerBId = await createOwner(env, OWNER_B.email)

  // The handle_new_user trigger already inserted both profiles.
  await client.query(
    `update public.profiles set credits = $2, locale = $3, role = $4 where id = $1`,
    [ownerAId, OWNER_A.expectedCredits, OWNER_A.locale, OWNER_A.role],
  )
  await client.query(
    `update public.profiles set credits = $2, locale = $3, role = $4 where id = $1`,
    [ownerBId, OWNER_B.expectedCredits, OWNER_B.locale, OWNER_B.role],
  )

  await client.query(
    `insert into public.pets (id, user_id, name, species, breed, age_years, weight_kg, sex, neutered, size_class, walk_activity, deleted_at)
     values
       ($1, $5, 'Мурка',  'cat', 'siberian',  4, 4.2, 'female', true,  null,     null,          null),
       ($2, $5, 'Рекс',   'dog', 'labrador',  3, 28.0, 'male',  false, 'large',  'daily_long',  null),
       ($3, $6, 'Barsik', 'cat', 'british',   7, 5.1, 'male',   true,  null,     null,          null),
       ($4, $6, 'Ghost',  'cat', 'unknown',   2, 3.3, 'female', false, null,     null,          now())`,
    [PET_IDS.aCat, PET_IDS.aDog, PET_IDS.bCat, PET_IDS.bDeleted, ownerAId, ownerBId],
  )

  // Same created_at on the first two rows on purpose: history pagination has to
  // stay stable when timestamps tie (plan item 3/02).
  await client.query(
    `insert into public.symptom_checks
       (id, user_id, pet_id, symptoms_input, urgency, urgency_reason, possible_causes,
        species_specific_warning, home_care_steps, vet_questions, full_response, created_at, deleted_at)
     values
       ($1, $5, $7,  'vomiting twice',     'monitor',   'stable vitals',  array['diet change'],  null, array['withhold food 6h'], array['when did it start?'], '{}'::jsonb, timestamp '2026-05-01 10:00:00', null),
       ($2, $5, $8,  'limping front paw',  'urgent',    'weight bearing', array['sprain'],       null, array['restrict movement'], array['any trauma?'],       '{}'::jsonb, timestamp '2026-05-01 10:00:00', null),
       ($3, $6, $9,  'sneezing',           'home_care', 'no fever',       array['mild rhinitis'],null, array['humidify air'],     array['appetite normal?'],   '{}'::jsonb, timestamp '2026-05-02 09:00:00', null),
       ($4, $6, $10, 'deleted check',      'healthy',   'no findings',    array['none'],         null, array['none'],             array['none'],               '{}'::jsonb, timestamp '2026-05-02 09:30:00', now())`,
    [
      CHECK_IDS.aFirst, CHECK_IDS.aSecond, CHECK_IDS.bOnly, CHECK_IDS.bDeleted,
      ownerAId, ownerBId,
      PET_IDS.aCat, PET_IDS.aDog, PET_IDS.bCat, PET_IDS.bDeleted,
    ],
  )

  const packageId = (
    await client.query<{ id: string }>(`select id from public.packages where code = 'pack_5_rub_v1'`)
  ).rows[0].id

  await client.query(
    `insert into public.payment_methods (user_id, provider, provider_pm_id, brand, last4, is_default)
     values ($1, 'dummy', 'pm_fixture_owner_a', 'dummy', '4242', true)`,
    [ownerAId],
  )

  const transactionId = (
    await client.query<{ id: string }>(
      `insert into public.transactions
         (user_id, provider, provider_payment_id, package_id, units_total, unit_price, amount, currency, current_status)
       select $1, 'dummy', 'pay_fixture_owner_a', p.id, p.units, p.unit_price, p.amount, p.currency, 'succeeded'
       from public.packages p where p.id = $2
       returning id`,
      [ownerAId, packageId],
    )
  ).rows[0].id

  const eventId = (
    await client.query<{ id: string }>(
      `insert into public.transaction_status_events (transaction_id, status, reason, provider_event_id)
       values ($1, 'succeeded', 'fixture', 'evt_fixture_owner_a') returning id`,
      [transactionId],
    )
  ).rows[0].id

  await client.query(`update public.transactions set current_status_event_id = $2 where id = $1`, [
    transactionId,
    eventId,
  ])

  // Ledger movements must add up to profiles.credits for each owner.
  await client.query(
    `insert into public.credit_ledger (user_id, delta, reason, transaction_id, symptom_check_id, balance_after, created_at)
     values
       ($1,  2, 'signup_bonus', null, null, 2, timestamp with time zone '2026-04-30 08:00:00+00'),
       ($1,  5, 'purchase',     $3,   null, 7, timestamp with time zone '2026-04-30 09:00:00+00'),
       ($1, -1, 'usage',        null, $4,   6, timestamp with time zone '2026-05-01 10:00:00+00'),
       ($1, -1, 'usage',        null, $5,   5, timestamp with time zone '2026-05-01 10:00:01+00'),
       ($2,  2, 'signup_bonus', null, null, 2, timestamp with time zone '2026-04-30 08:00:00+00'),
       ($2, -1, 'usage',        null, $6,   1, timestamp with time zone '2026-05-02 09:00:00+00')`,
    [ownerAId, ownerBId, transactionId, CHECK_IDS.aFirst, CHECK_IDS.aSecond, CHECK_IDS.bOnly],
  )

  return { ownerAId, ownerBId }
}
