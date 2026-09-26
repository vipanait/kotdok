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
 * - «Барон …» — a cat with a long record (over thirty entries, the longest
 *   names and texts the contracts allow, one unbroken word) for the printed,
 *   several-page summary for the vet (MW-07).
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
  const { rows: products } = await db.query(`select id, kind, name, interval_value, interval_unit from public.health_products`)
  const product = (kind, name) => products.find((row) => row.kind === kind && row.name === name) ?? null
  const productId = (name) => product('vaccine', name)?.id ?? null
  // Treatments carry their catalogue product too, so «Сделано» suggests the next
  // date by its own interval (Бравекто Спот-он: 12 weeks; Мильбемакс: 3 months).
  const spotOn = product('antiparasitic', 'Бравекто Спот-он')
  const milbemax = product('antiparasitic', 'Мильбемакс')

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
    { kind: 'parasite', status: 'done', date: '2026-06-20', items: [{ name: 'Бравекто Спот-он', targets: ['fleas', 'ticks'], product_id: spotOn?.id ?? null }] },
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
    `insert into public.pet_health_items (event_id, user_id, pet_id, name, targets, source_item_id, product_id, interval_value, interval_unit)
     values ($1, $2, $3, 'Бравекто Спот-он', array['fleas', 'ticks'], $4, $5, $6, $7)`,
    [overduePlan.id, userId, murka.id, bravecto.items[0].id, spotOn?.id ?? null, spotOn?.interval_value ?? null, spotOn?.interval_unit ?? null],
  )
  await api(
    'POST',
    `/pets/${murka.id}/health/events`,
    { kind: 'parasite', status: 'done', date: '2026-07-05', items: [{ name: 'Мильбемакс', targets: ['worms'], product_id: milbemax?.id ?? null, next_on: '2026-10-05' }] },
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
        { name: 'Лечебный корм', dosage: 'По схеме врача', started_on: '2026-08-02', ongoing: true },
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

  // ---------- Барон: a long record, for the printed summary (MW-07) ----------
  // Over thirty records, the longest names and texts the contracts allow and
  // one unbroken word: the vet summary must run to several A4 pages without
  // cutting a table, splitting a row or letting a line out of the margins.
  const dayBefore = (days) => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date())
    return new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10)
  }
  const cut = (text, max) => Array.from(text).slice(0, max).join('')
  const baron = await api('POST', '/pets', {
    species: 'cat',
    name: cut('Барон Мурлыкенштейн фон Длиннохвостов-Пушистиков Третий, главный кот третьего подъезда', 100),
    breed: 'Британская короткошёрстная голубая',
    age_years: 11,
    sex: 'male',
    neutered: true,
    vaccinated: true,
    allergies: ['Курица', 'Говядина', 'Пыльца злаковых трав', 'Некоторые антибиотики пенициллинового ряда'],
    chronic_conditions: ['Хроническая болезнь почек, стадия 2 по IRIS', 'Гипертиреоз', 'Артроз локтевых суставов'],
    notes: DEMO_NOTE,
  })
  for (const [back, kg] of [[700, 5.9], [540, 6.1], [400, 6.0], [300, 5.8], [200, 5.6], [120, 5.5], [60, 5.4], [10, 5.3]]) {
    await api('POST', `/pets/${baron.id}/health/weights`, { measured_on: dayBefore(back), weight_kg: kg })
  }
  const longProduct = cut('Нобивак Tricat Trio — комплексная вакцина против панлейкопении, калицивироза и ринотрахеита', 100)
  const vaccineRuns = [
    [720, longProduct, ['panleukopenia', 'calicivirus', 'rhinotracheitis']],
    [700, 'Нобивак Rabies', ['rabies']],
    [600, 'Пуревакс FeLV', ['felv']],
    [360, longProduct, ['panleukopenia', 'calicivirus', 'rhinotracheitis']],
    [340, 'Нобивак Rabies', ['rabies']],
    [250, 'Фелоцел CVR-C с компонентом против хламидиоза', ['chlamydia']],
  ]
  for (const [back, name, targets] of vaccineRuns) {
    await api('POST', `/pets/${baron.id}/health/events`, { kind: 'vaccination', status: 'done', date: dayBefore(back), clinic: 'Ветеринарный центр «Айболит» на Садовой', items: [{ name, targets }] }, withKey())
  }
  for (const [back, name, targets] of [[150, 'Бравекто Спот-он', ['fleas', 'ticks']], [90, 'Мильбемакс', ['worms']], [45, 'Стронгхолд Плюс', ['fleas', 'ticks']], [20, 'Профендер', ['worms']]]) {
    await api('POST', `/pets/${baron.id}/health/events`, { kind: 'parasite', status: 'done', date: dayBefore(back), items: [{ name, targets }] }, withKey())
  }
  const unbroken = 'Амоксициллинклавуланатсуспензиядляперорального'.repeat(2)
  const diagnoses = [
    'Обострение хронической болезни почек',
    'Гипертиреоз, подбор дозы',
    `Хроническая болезнь почек, стадия 2 по IRIS, с умеренной протеинурией и артериальной гипертензией; рекомендовано наблюдение нефролога каждые три месяца, контроль креатинина, SDMA и соотношения белок/креатинин в моче, ограничение фосфора в рационе и повторное измерение давления через две недели после начала терапии. ${unbroken}`,
    'Артроз локтевых суставов',
    'Зубной камень, гингивит',
  ]
  for (let index = 0; index < 24; index += 1) {
    const prescriptions = Array.from({ length: 1 + (index % 4) }, (_, n) => ({
      name: n === 0 && index === 2 ? unbroken.slice(0, 100) : cut(`Препарат ${n + 1} после визита ${index + 1} — ${['Семинтра', 'Ипакитине', 'Метимазол', 'Мелоксидил'][n]}`, 100),
      instructions: cut(
        index % 3 === 0
          ? 'По 0,5 таблетки два раза в день во время еды, курс 14 дней; при рвоте или отказе от еды прекратить приём и сообщить лечащему врачу клиники'
          : 'По схеме врача',
        150,
      ),
      add_to_medications: false,
    }))
    await api(
      'POST',
      `/pets/${baron.id}/health/visits`,
      {
        status: 'done',
        date: dayBefore(350 - index * 14),
        visit_kind: ['checkup', 'illness', 'tests', 'other'][index % 4],
        clinic: 'Ветеринарный центр «Айболит» на Садовой',
        reason: 'Контроль хронических болезней',
        diagnosis: cut(diagnoses[index % diagnoses.length], 500),
        prescriptions,
      },
      withKey(),
    )
  }
  await api(
    'POST',
    `/pets/${baron.id}/health/medications`,
    {
      items: [
        { name: 'Семинтра', dosage: cut('1 мл раствора внутрь один раз в день утром, вместе с небольшим количеством корма, строго в одно и то же время', 150), started_on: dayBefore(200), ongoing: true },
        { name: 'Метимазол', dosage: '2,5 мг два раза в день', started_on: dayBefore(120), ongoing: true },
        { name: 'Ренальный лечебный корм', dosage: 'Постоянно, вместо обычного', started_on: dayBefore(300), ongoing: true },
        { name: 'Ипакитине', dosage: '1 мерная ложка на 5 кг веса с каждым кормлением', started_on: dayBefore(90), ended_on: dayBefore(-30) },
        { name: 'Мелоксидил', dosage: '0,1 мл на кг один раз в день', started_on: dayBefore(40), ended_on: dayBefore(20) },
        // Starts later: under «Сейчас» on the medicines page, not in «Принимает сейчас» nor in the summary.
        { name: 'Витамины для суставов', dosage: '1 таблетка в день', started_on: dayBefore(-5), ongoing: true },
      ],
    },
    withKey(),
  )
  for (const [back, urgency, text] of [
    [30, 'monitor', 'Стал больше пить и чаще ходить в лоток, аппетит сохранён, вес немного снизился за последний месяц'],
    [12, 'urgent', 'Рвота трижды за сутки, отказ от еды со вчерашнего вечера, вялый'],
    [3, 'home_care', 'Чихает второй день, выделения из носа прозрачные'],
  ]) {
    await db.query(
      `insert into public.symptom_checks
         (user_id, pet_id, symptoms_input, urgency, urgency_reason, possible_causes, species_specific_warning,
          home_care_steps, vet_questions, full_response, created_at, locale)
       values ($1, $2, $3, $4, 'Демо MW-07', array[]::text[], null, array[]::text[], array[]::text[], '{}'::jsonb, $5, 'ru')`,
      [userId, baron.id, text, urgency, `${dayBefore(back)}T09:00:00Z`],
    )
  }

  console.log(JSON.stringify({ owner: OWNER_A, murka: murka.id, bobik: bobik.id, baron: baron.id }, null, 2))
} finally {
  await db.end()
}
