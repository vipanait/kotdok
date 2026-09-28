/**
 * MW-09 Task 2: the HTTP status and redirects of the pages that used to
 * answer 200 with a «not found» page, and where the pet gate sends a visitor
 * who owes consent. Plain HTTP with the owner's session cookie, as a browser
 * would send it — no browser needed:
 *
 *   node docs/verification/medical-record-web-09/http-status.mjs
 *
 * Needs the local Supabase stack, the site on http://localhost:3100 started
 * with apps/web/.env.integration («web-local»), the fixture owners and the
 * seeded demo pets. Local only: it refuses any origin or stack that is not
 * localhost. It writes to the local database, and undoes what matters: owner A's
 * consent rows are removed and `pd_consent_required` is set for the consent
 * check, then the flag is cleared again (an account without the flag owes nothing).
 * Prints JSON.
 */

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../..')
const require = createRequire(resolve(root, 'apps/web/package.json'))
const { createServerClient } = require('@supabase/ssr')
const { Client } = require('pg')

const SITE = process.env.SITE ?? 'http://localhost:3100'
if (!['localhost', '127.0.0.1'].includes(new URL(SITE).hostname)) throw new Error('Local site only')
const env = Object.fromEntries(
  readFileSync(resolve(root, 'apps/web/.env.integration'), 'utf8')
    .split('\n')
    .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]),
)
if (!['127.0.0.1', 'localhost'].includes(new URL(env.TEST_SUPABASE_URL).hostname)) throw new Error('Local stack only')
const database = new URL(env.TEST_DATABASE_URL)
if (!['127.0.0.1', 'localhost'].includes(database.hostname)) throw new Error('Local database only')
const password = /FIXTURE_PASSWORD = '([^']+)'/.exec(readFileSync(resolve(root, 'apps/web/tests/integration/fixtures.ts'), 'utf8'))[1]

/** The session cookies the site's own Supabase client would set on sign-in. */
async function sessionCookie(email) {
  const jar = new Map()
  const supabase = createServerClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  })
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return { cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '), token: data.session.access_token, userId: data.user.id }
}

const api = (path, token) =>
  fetch(`${SITE}/api/v1${path}`, { headers: { authorization: `Bearer ${token}` } }).then((response) => response.json())

async function page(path, cookie, headers = {}) {
  const response = await fetch(`${SITE}${path}`, { headers: { cookie, ...headers }, redirect: 'manual' })
  const body = response.status === 200 || response.status === 404 ? await response.text() : ''
  return {
    status: response.status,
    location: response.headers.get('location'),
    noindex: /<meta name="robots" content="noindex"/.test(body),
  }
}

const db = new Client({ connectionString: env.TEST_DATABASE_URL })
await db.connect()
const setConsentOwed = (userId, owed) => db.query('update public.profiles set pd_consent_required = $2 where id = $1', [userId, owed])

const a = await sessionCookie('owner-a@fixture.local')
const b = await sessionCookie('owner-b@fixture.local')
const murka = (await api('/pets', a.token)).find((pet) => pet.name === 'Мурка' && pet.notes === 'Демо медкарты (seed-medical-record-demo)')
if (!murka) throw new Error('Seed the demo pets first (apps/web/scripts/seed-medical-record-demo.mjs)')
const record = await api(`/pets/${murka.id}/health`, a.token)
const event = record.events[0]
const planned = record.events.find((entry) => entry.status === 'planned' && entry.kind !== 'visit')
const course = record.medications[0]
const ownCheck = (await api(`/checks?pet_id=${murka.id}&limit=1`, a.token)).items?.[0] ?? null
const bPets = await api('/pets', b.token)
const bCheck = (await api('/checks?limit=1', b.token)).items?.[0] ?? null
const missing = '00000000-0000-4000-8000-000000000000'

const out = { site: SITE, murka: murka.id, pages: {} }
const check = async (label, path, cookie = a.cookie) => (out.pages[label] = { path, ...(await page(path, cookie)) })

// A record that is not there, inside the owner's own pet: a real 404.
await check('missingRecord', `/pets/${murka.id}/health/${missing}`)
await check('missingRecordEdit', `/pets/${murka.id}/health/${missing}/edit`)
await check('missingRecordComplete', `/pets/${murka.id}/health/${missing}/complete`)
await check('malformedRecord', `/pets/${murka.id}/health/not-a-record`)
await check('otherPetsRecord', `/pets/${bPets[0]?.id ?? missing}/health/${event.id}`)
// Records that are there: 200, and a done one's edit address an HTTP redirect to the record.
await check('ownRecord', `/pets/${murka.id}/health/${event.id}`)
await check('ownCourse', `/pets/${murka.id}/health/${course.id}`)
if (planned) await check('ownPlanComplete', `/pets/${murka.id}/health/${planned.id}/complete`)
const done = record.events.find((entry) => entry.status === 'done' && entry.kind !== 'visit')
if (done) await check('doneRecordEdit', `/pets/${murka.id}/health/${done.id}/edit`)
// ?check= of a visit written from a check result.
if (bCheck) await check('visitFromForeignCheck', `/pets/${murka.id}/health/new?type=visit&check=${bCheck.id}`)
await check('visitFromMissingCheck', `/pets/${murka.id}/health/new?type=visit&check=${missing}`)
if (ownCheck) await check('visitFromOwnCheck', `/pets/${murka.id}/health/new?type=visit&check=${ownCheck.id}`)
await check('newRecordUnknownType', `/pets/${murka.id}/health/new?type=unknown`)
await check('newVaccination', `/pets/${murka.id}/health/new?type=vaccination`)
// The history of one pet.
if (bPets[0]) await check('checksForeignPet', `/checks?pet=${bPets[0].id}`)
await check('checksMissingPet', `/checks?pet=${missing}`)
await check('checksMalformedPet', `/checks?pet=not-a-pet`)
await check('checksOwnPet', `/checks?pet=${murka.id}`)
await check('checksAll', '/checks')
// The pet's other pages are unchanged: 200 for the owner, 404 for someone else.
for (const path of ['', '/edit', '/vet-summary', '/health/due', '/health/vaccinations', '/health/parasites', '/health/visits', '/health/medications', '/health/weight']) {
  await check(`own${path || '/'}`, `/pets/${murka.id}${path}`)
  await check(`foreign${path || '/'}`, `/pets/${murka.id}${path}`, b.cookie)
}

// Consent owed (#51): the pet gate sends to /consent with the page asked for, not the record.
// Owed means the flag and no consent row yet (task2-screens.mjs consents through the site).
await db.query('delete from public.personal_data_consents where user_id = $1', [a.userId])
await setConsentOwed(a.userId, true)
try {
  out.consent = {}
  for (const path of ['/edit', '/vet-summary', `/health/${event.id}`, '/health/new?type=weight&from=form', '']) {
    const result = await page(`/pets/${murka.id}${path}`, a.cookie)
    out.consent[path || '/'] = { status: result.status, location: result.location }
  }
  // The page path comes from the proxy, never from the client: a header of the same name sent
  // by the client is replaced, and the way back stays this page.
  out.consent.spoofedHeader = (await page(`/pets/${murka.id}/edit`, a.cookie, { 'x-lapka-page': '//evil.example/x' })).location
  out.consent.spoofedOtherPet = (await page(`/pets/${murka.id}/edit`, a.cookie, { 'x-lapka-page': `/pets/${missing}/edit` })).location
  // A spoofed page of the very same pet is not taken either: the record asked for stays the way back.
  out.consent.spoofedSamePet = (await page(`/pets/${murka.id}`, a.cookie, { 'x-lapka-page': `/pets/${murka.id}/edit` })).location
} finally {
  await setConsentOwed(a.userId, false)
  await db.end()
}

console.log(JSON.stringify(out, null, 2))
