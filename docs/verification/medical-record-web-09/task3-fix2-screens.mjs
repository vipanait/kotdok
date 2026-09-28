/**
 * MW-09 Task 3, fix round 2, in the browser: «Загрузить новые данные» on a
 * form the owner typed in (it is re-keyed while the Back guard's copy is in
 * history) keeps the owner on the form; Back then leaves it once, to the
 * page before it; typed in again, Back asks and «Уйти» goes there too.
 *
 * Same needs as task3-screens.mjs (local stack, «web-local» on :3100,
 * seeded demo pets, Playwright and Chrome):
 *
 *   PLAYWRIGHT=/path/to/node_modules/playwright \
 *   CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *   node docs/verification/medical-record-web-09/task3-fix2-screens.mjs > docs/verification/medical-record-web-09/task3-fix2-output.json
 *
 * Local only. Writes nothing to the database except one PATCH of a plan's
 * clinic (the drift case): seed the demo again afterwards.
 */

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../..')
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT ?? 'playwright')

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
const password = /FIXTURE_PASSWORD = '([^']+)'/.exec(readFileSync(resolve(root, 'apps/web/tests/integration/fixtures.ts'), 'utf8'))[1]

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

const text = (value) => (value ?? '').replace(/\s+/g, ' ').trim()
const shot = (page, name, full = true) => page.screenshot({ path: resolve(here, `${name}.png`), fullPage: full })
const out = { checks: {} }
const WEIGHT = '.weight-form input[inputmode=decimal]'

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
async function settle(page) {
  await page.waitForSelector('main h1')
  await page.waitForLoadState('networkidle').catch(() => {})
}
const path = (page) => {
  const url = new URL(page.url())
  return url.pathname + url.search
}
const focused = (page) =>
  page.evaluate(() => {
    const el = document.activeElement
    return { tag: el?.tagName.toLowerCase(), id: el?.id ?? '', inForm: !!el?.closest('form'), text: (el?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40) }
  })
async function openForm(page) {
  await page.goto(`${SITE}/pets/${bobik.id}/health/weight`)
  await settle(page)
  await Promise.all([page.waitForURL(/\/health\/new\?type=weight/), page.click('main .pagehead a.btn.primary')])
  await settle(page)
}
/** Back, then wait for whatever it leads to settle. */
async function back(page) {
  await page.goBack({ waitUntil: 'commit' }).catch(() => {})
  await page.waitForTimeout(700)
}

try {
  for (const width of [1440, 390]) {
    const ctx = await context(width)
    const page = await ctx.newPage()
    const plan = (await (await api(`/pets/${murka.id}/health`)).json()).events.find((event) => event.kind === 'parasite' && event.status === 'planned')
    await signIn(page, `/pets/${murka.id}/health/${plan.id}`)
    await settle(page)
    const planPage = path(page)
    const checks = {}

    for (const round of ['clean', 'typedAgain']) {
      await page.goto(`${SITE}${planPage}`)
      await settle(page)
      // The next read of the record waits until the owner has typed.
      let release
      const gate = new Promise((done) => (release = done))
      await page.route(/\/api\/v1\/pets\/[^/]+\/health(\?|$)/, async (route) => {
        await gate
        await route.continue()
      })
      await Promise.all([page.waitForURL(/\/edit$/), page.click('main a[href$="/edit"]')])
      await page.waitForSelector('.event-form')
      const formPage = path(page)
      await page.fill('.event-form textarea', 'Правка владельца')
      await page.waitForTimeout(100)
      await api(`/pets/${murka.id}/health/events/${plan.id}`, { method: 'PATCH', body: JSON.stringify({ clinic: `Другое устройство ${width} ${round}` }) })
      release()
      await page.waitForSelector('.health-drift')
      await page.unroute(/\/api\/v1\/pets\/[^/]+\/health(\?|$)/)
      await page.click('.health-drift button')
      await page.waitForSelector('.health-drift', { state: 'detached' })
      await page.waitForTimeout(700)
      const afterTake = { url: path(page), onForm: path(page) === formPage, dialog: (await page.$('[role=dialog]')) !== null, clinic: await page.inputValue('.event-form input[id$="-clinic"]') }
      let result
      if (round === 'clean') {
        await shot(page, `take-latest-${width}`)
        await back(page)
        result = { afterBack: path(page), dialog: (await page.$('[role=dialog]')) !== null }
      } else {
        await page.fill('.event-form textarea', 'Снова правка')
        await page.waitForTimeout(100)
        await back(page)
        await page.waitForSelector('[role=dialog]')
        const asked = { url: path(page), onForm: path(page) === formPage, title: text(await page.textContent('[role=dialog] h2')) }
        await Promise.all([page.waitForURL((url) => url.pathname + url.search === planPage), page.click('[role=dialog] button.btn.primary')])
        await settle(page)
        result = { asked, leftTo: path(page) }
      }
      checks[round] = { formPage, planPage, afterTake, ...result }
    }
    out.checks[`w${width}`] = checks
    await ctx.close()
  }
} finally {
  await browser.close()
}

console.log(JSON.stringify(out, null, 2))
