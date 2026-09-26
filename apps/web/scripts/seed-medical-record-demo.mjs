/**
 * Seeds the demo pets of the web medical record (spec §13) for the local
 * fixture owner A, so each MW stage can be shown on real data:
 *
 * - the draft catalogue of vaccines and treatments (supabase/catalog, unverified);
 * - «Мурка» — a cat whose record is filled through the v1 API itself
 *   (weights, vaccinations and treatments with their next dates, visits,
 *   courses), plus one symptom check the visit follows and one treatment
 *   plan that is overdue by now (both written directly: the API makes
 *   neither — checks come from the analysis, and a plan in the past is
 *   refused);
 * - «Бобик» — a dog of an "older account": the pet form only, written
 *   straight to the table as it was before the record existed, so the
 *   weight has no day and vaccination is only the form's answer.
 *
 * Local stack only. The API is the site running with apps/web/.env.integration
 * (`next dev -p 3100`, see .claude/launch.json «web-local»); both it and the
 * database must be 127.0.0.1, or the script stops before writing anything.
 * Run again to start over: the demo pets of an earlier run (marked by their
 * note, DEMO_NOTE) are deleted through the API first; fixture pets are never
 * touched. `npm run test:integration` recreates the fixture owners, which
 * removes the demo pets — run this again after it (and, if the suite ended
 * with the owners gone, `tests/integration/fixtures.test.ts` first).
 *
 *   node apps/web/scripts/seed-medical-record-demo.mjs [--api http://localhost:3100]
 */

import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function parseEnv(path) {
  const values = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match) values[match[1]] = match[2]
  }
  return values
}

function stop(message) {
  console.error(`\n${message}\n`)
  process.exit(1)
}

const env = parseEnv(resolve(webRoot, '.env.integration'))
const apiArg = process.argv.indexOf('--api')
const apiOrigin = apiArg > -1 ? process.argv[apiArg + 1] : 'http://localhost:3100'

const isLocal = (url) => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)
if (!isLocal(env.TEST_SUPABASE_URL) || !isLocal(env.TEST_DATABASE_URL.replace(/^postgresql:/, 'http:'))) {
  stop('The integration stack is not local; refusing to write.')
}
if (!isLocal(apiOrigin)) stop(`The API ${apiOrigin} is not local; refusing to write.`)

// The fixture password lives with the fixtures; read it rather than copy it.
const fixtures = readFileSync(resolve(webRoot, 'tests/integration/fixtures.ts'), 'utf8')
const password = /FIXTURE_PASSWORD = '([^']+)'/.exec(fixtures)?.[1]
if (!password) stop('FIXTURE_PASSWORD not found in tests/integration/fixtures.ts')
const OWNER_A = 'owner-a@fixture.local'

/** How the demo pets are told apart from anything else of owner A: the form's note. */
const DEMO_NOTE = 'Демо медкарты (seed-medical-record-demo)'

async function signIn(email) {
  const response = await fetch(`${env.TEST_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.TEST_SUPABASE_ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await response.json()
  if (!response.ok) stop(`Sign-in of ${email} failed: ${JSON.stringify(body)}. Run the integration fixtures first.`)
  return { token: body.access_token, userId: body.user.id }
}

const { token, userId } = await signIn(OWNER_A)

async function api(method, path, body, headers = {}) {
  const response = await fetch(`${apiOrigin}/api/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (response.status === 204) return null
  const payload = await response.json().catch(() => null)
  if (!response.ok) stop(`${method} ${path} → ${response.status} ${JSON.stringify(payload)}`)
  return payload
}

const withKey = () => ({ 'Idempotency-Key': randomUUID() })

// Start over: earlier demo pets go the way an owner would delete them. Only
// pets this script made — they carry DEMO_NOTE — and never an integration
// fixture (fixed ids 11111111-… / 22222222-…): the fixture «Мурка» is test
// data the integration suite relies on, not a demo pet.
const isFixture = (id) => /^(11111111|22222222)-/.test(id)
for (const pet of await api('GET', '/pets')) {
  if (pet.notes === DEMO_NOTE && !isFixture(pet.id)) await api('DELETE', `/pets/${pet.id}`)
}

const db = new pg.Client({ connectionString: env.TEST_DATABASE_URL })
await db.connect()

try {
  // The draft catalogue of the spec (§5.4), unverified: local stacks only.
  // Shown here because .env.integration sets HEALTH_CATALOG_INCLUDE_UNVERIFIED;
  // production shows verified products only. Upserts, so running again is safe.
  const repoRoot = resolve(webRoot, '..', '..')
  for (const file of ['draft-vaccines.sql', 'draft-antiparasitics.sql']) {
    await db.query(readFileSync(resolve(repoRoot, 'supabase', 'catalog', file), 'utf8'))
  }
  const { rows: products } = await db.query(`select id, name from public.health_products where kind = 'vaccine'`)
  const productId = (name) => products.find((row) => row.name === name)?.id ?? null

  // ---------- Мурка: a record filled through the API ----------
  const murka = await api('POST', '/pets', {
    species: 'cat',
    name: 'Мурка',
    breed: 'Сибирская',
    age_years: 3,
    sex: 'female',
    neutered: true,
    vaccinated: true,
    allergies: ['Курица'],
    chronic_conditions: ['Хронический гастрит'],
    notes: DEMO_NOTE,
  })

  for (const [measured_on, weight_kg] of [['2026-03-12', 4.5], ['2026-06-20', 4.4], ['2026-09-12', 4.2]]) {
    await api('POST', `/pets/${murka.id}/health/weights`, { measured_on, weight_kg })
  }

  await api(
    'POST',
    `/pets/${murka.id}/health/events`,
    {
      kind: 'vaccination',
      status: 'done',
      date: '2026-03-12',
      clinic: 'Айболит',
      items: [
        { name: 'Нобивак Tricat Trio', targets: ['panleukopenia', 'calicivirus', 'rhinotracheitis'], product_id: productId('Нобивак Tricat Trio'), next_on: '2027-03-12' },
        { name: 'Нобивак Rabies', targets: ['rabies'], product_id: productId('Нобивак Rabies'), next_on: '2027-03-12' },
      ],
    },
    withKey(),
  )
  const bravecto = await api(
    'POST',
    `/pets/${murka.id}/health/events`,
    { kind: 'parasite', status: 'done', date: '2026-06-20', items: [{ name: 'Бравекто Спот-он', targets: ['fleas', 'ticks'] }] },
    withKey(),
  )
  // Its next date, 12 September, is overdue by now. The API rightly refuses a
  // plan in the past; in real life this plan was made in June, when it was
  // ahead. So it is written as the June save would have left it.
  const { rows: [overduePlan] } = await db.query(
    `insert into public.pet_health_events (user_id, pet_id, kind, status, event_date)
     values ($1, $2, 'parasite', 'planned', date '2026-09-12') returning id`,
    [userId, murka.id],
  )
  await db.query(
    `insert into public.pet_health_items (event_id, user_id, pet_id, name, targets, source_item_id)
     values ($1, $2, $3, 'Бравекто Спот-он', array['fleas', 'ticks'], $4)`,
    [overduePlan.id, userId, murka.id, bravecto.items[0].id],
  )
  await api(
    'POST',
    `/pets/${murka.id}/health/events`,
    { kind: 'parasite', status: 'done', date: '2026-07-05', items: [{ name: 'Мильбемакс', targets: ['worms'], next_on: '2026-10-05' }] },
    withKey(),
  )

  // The check the visit followed: made by the analysis in real life, so written directly here.
  const { rows: [check] } = await db.query(
    `insert into public.symptom_checks
       (user_id, pet_id, symptoms_input, urgency, urgency_reason, possible_causes,
        species_specific_warning, home_care_steps, vet_questions, full_response, created_at, locale)
     values ($1, $2, 'Рвота два дня, отказ от еды', 'monitor', 'Состояние стабильное, но рвота повторяется',
             array['Обострение гастрита', 'Пищевая непереносимость'], null,
             array['Небольшие порции лёгкой еды'], array['Нужно ли сдать анализы?'], '{}'::jsonb,
             timestamp '2026-08-01 09:30:00', 'ru')
     returning id`,
    [userId, murka.id],
  )

  await api(
    'POST',
    `/pets/${murka.id}/health/visits`,
    {
      status: 'done',
      date: '2026-08-02',
      visit_kind: 'illness',
      clinic: 'Айболит',
      reason: 'Рвота два дня, отказ от еды',
      diagnosis: 'Обострение гастрита',
      check_id: check.id,
      prescriptions: [
        { name: 'Фортифлора', instructions: '1 пакетик в день, 14 дней' },
        { name: 'Лечебный корм', instructions: 'постоянно' },
      ],
    },
    withKey(),
  )
  await api(
    'POST',
    `/pets/${murka.id}/health/visits`,
    { status: 'planned', date: '2026-10-03', visit_kind: 'checkup', reason: 'Контрольный осмотр' },
    withKey(),
  )

  await api(
    'POST',
    `/pets/${murka.id}/health/medications`,
    {
      items: [
        { name: 'Лечебный корм', started_on: '2026-08-02', ongoing: true },
        { name: 'Фортифлора', dosage: '1 пакетик в день', started_on: '2026-08-02', ended_on: '2026-08-15' },
      ],
    },
    withKey(),
  )

  // ---------- Бобик: the pet form of an older account ----------
  const { rows: [bobik] } = await db.query(
    `insert into public.pets (user_id, name, species, age_years, weight_kg, vaccinated, notes)
     values ($1, 'Бобик', 'dog', 5, 28, true, $2)
     returning id`,
    [userId, DEMO_NOTE],
  )

  console.log(JSON.stringify({ owner: OWNER_A, murka: murka.id, bobik: bobik.id }, null, 2))
} finally {
  await db.end()
}
