/**
 * MW-09 Task 2, in the browser: the way back after sign-in and consent (#51)
 * to the page asked for, the pet list's due lines named as spec §7.1 names
 * them (a planned visit by its kind), a missing record's 404 page, and the
 * owner's day on the record's request (`GET /health?today=`).
 *
 * Needs the same as verify.mjs of MW-08: the local stack, the site on
 * http://localhost:3100 («web-local»), the fixture owners, freshly seeded demo
 * pets, Playwright and Chrome:
 *
 *   PLAYWRIGHT=/path/to/node_modules/playwright \
 *   CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *   node docs/verification/medical-record-web-09/task2-screens.mjs > docs/verification/medical-record-web-09/task2-screens-output.json
 *
 * Writes PNGs next to this file and prints JSON. Local only. It writes to
 * the local database: owner A is made to owe consent and consents through
 * the site (the flag is cleared again at the end), and a planned check-up of
 * «Бобик» is added through the API and deleted again.
 */

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../..')
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT ?? 'playwright')
const { Client } = createRequire(resolve(root, 'apps/web/package.json'))('pg')

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
if (!['127.0.0.1', 'localhost'].includes(new URL(env.TEST_DATABASE_URL).hostname)) throw new Error('Local database only')
const password = /FIXTURE_PASSWORD = '([^']+)'/.exec(readFileSync(resolve(root, 'apps/web/tests/integration/fixtures.ts'), 'utf8'))[1]

const db = new Client({ connectionString: env.TEST_DATABASE_URL })
await db.connect()
const ownerA = (await db.query(`select id from auth.users where email = 'owner-a@fixture.local'`)).rows[0].id
// Start from an owner who owes nothing (the API refuses one who does).
await db.query(`update public.profiles set pd_consent_required = false where id = $1`, [ownerA])

const token = await fetch(`${env.TEST_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: env.TEST_SUPABASE_ANON_KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'owner-a@fixture.local', password }),
})
  .then((response) => response.json())
  .then((body) => body.access_token)
const api = (path, init = {}) =>
  fetch(`${SITE}/api/v1${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
const demo = (await (await api('/pets')).json()).filter((pet) => pet.notes === 'Демо медкарты (seed-medical-record-demo)')
const murka = demo.find((pet) => pet.name === 'Мурка')
const bobik = demo.find((pet) => pet.name === 'Бобик')
if (!murka || !bobik) throw new Error('Seed the demo pets first (apps/web/scripts/seed-medical-record-demo.mjs)')

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date())
const plus = (days) => new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
const text = (value) => (value ?? '').replace(/\s+/g, ' ').trim()
const shot = (page, name) => page.screenshot({ path: resolve(here, `${name}.png`), fullPage: true })
const out = { murka: murka.id, bobik: bobik.id, checks: {} }

const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true })
async function context(width) {
  return browser.newContext({ viewport: { width, height: width > 760 ? 1000 : 844 }, deviceScaleFactor: 1, locale: 'ru-RU', timezoneId: 'Europe/Moscow' })
}
async function signIn(page, next) {
  await page.goto(`${SITE}/login?next=${encodeURIComponent(next)}`)
  await page.fill('input[type=email]', 'owner-a@fixture.local')
  await page.fill('input[type=password]', password)
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login')), page.press('input[type=password]', 'Enter')])
}

// A planned check-up for «Бобик» the day after tomorrow: its line names the kind.
const visitResponse = await api(`/pets/${bobik.id}/health/visits`, {
  method: 'POST',
  headers: { 'Idempotency-Key': crypto.randomUUID() },
  body: JSON.stringify({ status: 'planned', date: plus(2), visit_kind: 'checkup' }),
})
const visit = await visitResponse.json()

try {
  // ----- Consent owed: sign in to the pet's form, consent, and land on the form -----
  await db.query(`delete from public.personal_data_consents where user_id = $1`, [ownerA])
  await db.query(`update public.profiles set pd_consent_required = true where id = $1`, [ownerA])
  {
    const ctx = await context(1440)
    const page = await ctx.newPage()
    await signIn(page, `/pets/${murka.id}/edit`)
    await page.waitForURL((url) => url.pathname === '/consent')
    await page.waitForSelector('main')
    const consentUrl = page.url()
    await shot(page, 'consent-next-edit-1440')
    await page.getByRole('checkbox').check()
    await Promise.all([page.waitForURL((url) => url.pathname.startsWith('/pets/')), page.getByRole('button', { name: 'Продолжить' }).click()])
    await page.waitForSelector('main h1')
    await page.waitForLoadState('networkidle').catch(() => {})
    await shot(page, 'consent-back-on-edit-1440')
    out.checks.consent = { consentPage: new URL(consentUrl).pathname + new URL(consentUrl).search, landedOn: new URL(page.url()).pathname, heading: text(await page.textContent('main h1')) }
    await ctx.close()
  }
  await db.query(`update public.profiles set pd_consent_required = false where id = $1`, [ownerA])

  // ----- The pet list's due lines (spec §7.1) and the owner's day on the record's request -----
  for (const width of [320, 390, 1440]) {
    const ctx = await context(width)
    const page = await ctx.newPage()
    const healthRequests = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (/^\/api\/v1\/pets\/[^/]+\/health$/.test(url.pathname)) healthRequests.push(url.search)
    })
    await signIn(page, '/pets')
    const lines = {}
    // The pet list and the overview: the status of every due line is shown whole, only the name is cut (MW-09 review).
    for (const [where, path] of [['pets', '/pets'], ['dashboard', '/dashboard']]) {
      await page.goto(`${SITE}${path}`)
      await page.waitForSelector('main h1')
      await page.waitForLoadState('networkidle').catch(() => {})
      await shot(page, `${where}-due-lines-${width}`)
      lines[where] = await page.$$eval('main .compact-pet', (rows) =>
        rows
          .filter((row) => row.querySelector('.compact-pet-due'))
          .map((row) => {
            const line = row.querySelector('.compact-pet-due')
            const title = line.querySelector('.compact-pet-due-title')
            const status = line.querySelector('.compact-pet-due-status')
            const box = line.getBoundingClientRect()
            const end = status.getBoundingClientRect()
            return {
              pet: row.querySelector('h3')?.textContent ?? '',
              text: line.textContent.replace(/\s+/g, ' ').trim(),
              status: status.textContent,
              statusWhole: status.scrollWidth <= status.clientWidth && end.right <= box.right + 0.5 && end.left >= box.left,
              titleCut: title.scrollWidth > title.clientWidth,
            }
          }),
      )
    }
    await page.goto(`${SITE}/pets/${murka.id}`)
    await page.waitForSelector('main h1')
    await page.waitForLoadState('networkidle').catch(() => {})
    out.checks[`pets${width}`] = { dueLines: lines, recordRequests: healthRequests, scrollsSideways: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth) }
    // A record that is not there: the site's 404 page, answered with 404.
    const response = await page.goto(`${SITE}/pets/${murka.id}/health/00000000-0000-4000-8000-000000000000`)
    await page.waitForSelector('main')
    await shot(page, `missing-record-404-${width}`)
    out.checks[`missingRecord${width}`] = { status: response.status(), heading: text(await page.textContent('main h1').catch(() => '')) }
    await ctx.close()
  }
} finally {
  await db.query(`update public.profiles set pd_consent_required = false where id = $1`, [ownerA])
  if (visit?.id) await api(`/pets/${bobik.id}/health/events/${visit.id}`, { method: 'DELETE' })
  await db.end()
  await browser.close()
}

console.log(JSON.stringify(out, null, 2))
