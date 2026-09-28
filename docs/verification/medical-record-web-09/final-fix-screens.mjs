/**
 * MW-09 final-review fix wave, in the browser:
 *
 * - B1: a form that is the tab's first entry (a fresh page opened straight
 *   on the form, as a new tab, a bookmark or a restored tab does): type,
 *   Back — the form asks; «Уйти» leaves to the form's back link, the
 *   question closes, and nothing is left behind (no dead button);
 * - B-m1: the skip link «Перейти к содержимому» over a form with changes
 *   (after typing, and before it): no `#main` entry, focus on the main
 *   region; Back then asks once and «Уйти» goes to the page before the form;
 * - B-m3: `&from=form` on a pet with a weight history opens an empty weighing;
 * - B-m4: «Все сроки» back from «Состоялся» says it in the visit's words.
 *
 * Same needs as task3-screens.mjs (local stack, «web-local» on :3100,
 * seeded demo pets, Playwright and Chrome):
 *
 *   PLAYWRIGHT=/path/to/node_modules/playwright \
 *   CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *   node docs/verification/medical-record-web-09/final-fix-screens.mjs > docs/verification/medical-record-web-09/final-fix-output.json
 *
 * Local only. Writes nothing to the database.
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
const api = (path) => fetch(`${SITE}/api/v1${path}`, { headers: { authorization: `Bearer ${token}` } })
const demo = (await (await api('/pets')).json()).filter((pet) => pet.notes === 'Демо медкарты (seed-medical-record-demo)')
const murka = demo.find((pet) => pet.name === 'Мурка')
const bobik = demo.find((pet) => pet.name === 'Бобик')
if (!murka || !bobik) throw new Error('Seed the demo pets first (apps/web/scripts/seed-medical-record-demo.mjs)')

const text = (value) => (value ?? '').replace(/\s+/g, ' ').trim()
const shot = (page, name, full = false) => page.screenshot({ path: resolve(here, `${name}.png`), fullPage: full })
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
  return url.pathname + url.search + url.hash
}
const historyLength = (page) => page.evaluate(() => window.history.length)
const dialog = async (page) => (await page.$('[role=dialog]')) !== null
/** Back, then wait for whatever it leads to settle. */
async function back(page) {
  await page.goBack({ waitUntil: 'commit' }).catch(() => {})
  await page.waitForTimeout(700)
}

try {
  for (const width of [1440, 390]) {
    const ctx = await context(width)
    const signing = await ctx.newPage()
    await signIn(signing, `/pets/${bobik.id}/health/weight`)
    await settle(signing)
    const checks = {}
    /**
     * A new tab opened straight on an address, as cmd-click or a bookmark does:
     * its first entry is that page (Playwright's own `newPage` keeps an
     * about:blank entry before it, which is not the case being checked).
     */
    async function freshTab(address) {
      const [page] = await Promise.all([
        ctx.waitForEvent('page'),
        signing.evaluate((url) => void window.open(url, '_blank', 'noopener'), `${SITE}${address}`),
      ])
      await page.waitForLoadState()
      return page
    }

    // B1: the form is the first page of a fresh tab — for the weight form and a
    // new vaccination (each leads back to its own section).
    for (const [name, form, section, field] of [
      ['weight', `/pets/${bobik.id}/health/new?type=weight`, `/pets/${bobik.id}/health/weight`, WEIGHT],
      ['vaccination', `/pets/${murka.id}/health/new?type=vaccination`, `/pets/${murka.id}/health/vaccinations`, '.event-form input[type=date]'],
    ]) {
      const page = await freshTab(form)
      await settle(page)
      const opened = { url: path(page), historyLength: await historyLength(page) }
      if (name === 'weight') await page.fill(field, '31,5')
      else await page.fill(field, '2026-09-01')
      await page.waitForTimeout(300)
      const typed = { historyLength: await historyLength(page) }
      await back(page)
      await page.waitForSelector('[role=dialog]', { timeout: 5000 })
      const asked = { url: path(page), onForm: path(page) === form, title: text(await page.textContent('[role=dialog] h2')) }
      if (name === 'weight') await shot(page, `first-entry-ask-${width}`)
      const clicked = Date.now()
      await Promise.all([page.waitForURL((url) => url.pathname + url.search === section, { timeout: 8000 }), page.click('[role=dialog] button.btn.primary')])
      await settle(page)
      const left = {
        url: path(page),
        ms: Date.now() - clicked,
        dialog: await dialog(page),
        historyLength: await historyLength(page),
        // The copy is gone: Back from the section is the form, once, not asking.
        guardEntries: await page.evaluate(() => (window.history.state && window.history.state.__lapkaLeaveGuard) === true),
      }
      if (name === 'weight') await shot(page, `first-entry-left-${width}`)
      await back(page)
      await settle(page)
      const backAgain = { url: path(page), dialog: await dialog(page) }
      checks[`firstEntry_${name}`] = { opened, typed, asked, left, backAgain }
      await page.close()
    }

    // B-m1: the skip link over a form with changes — after typing and before.
    for (const order of ['afterTyping', 'beforeTyping']) {
      const page = await ctx.newPage()
      await page.goto(`${SITE}/pets/${bobik.id}/health/weight`)
      await settle(page)
      const section = path(page)
      await Promise.all([page.waitForURL(/\/health\/new\?type=weight/), page.click('main .pagehead a.btn.primary')])
      await settle(page)
      const form = path(page)
      const skip = async () => {
        await page.focus('.skip-link')
        await page.keyboard.press('Enter')
        await page.waitForTimeout(300)
      }
      if (order === 'beforeTyping') await skip()
      await page.fill(WEIGHT, '31,5')
      await page.waitForTimeout(300)
      const lengthBefore = await historyLength(page)
      if (order === 'afterTyping') await skip()
      const skipped = {
        url: path(page),
        noHash: !page.url().includes('#'),
        historyLengthUnchanged: (await historyLength(page)) === lengthBefore,
        focus: await page.evaluate(() => document.activeElement?.id ?? ''),
      }
      await back(page)
      await page.waitForSelector('[role=dialog]', { timeout: 5000 })
      const asked = { url: path(page), onForm: path(page) === form }
      if (order === 'afterTyping') await shot(page, `skip-link-back-ask-${width}`)
      await Promise.all([page.waitForURL((url) => url.pathname + url.search === section, { timeout: 8000 }), page.click('[role=dialog] button.btn.primary')])
      await settle(page)
      checks[`skipLink_${order}`] = { skipped, asked, left: { url: path(page), toPageBefore: path(page) === section, dialog: await dialog(page) } }
      await page.close()
    }

    // B-m3: «Уточнить» of the pet form's weight with a history behind it: an empty weighing.
    {
      const page = await ctx.newPage()
      const weights = (await (await api(`/pets/${murka.id}/health`)).json()).weights.length
      await page.goto(`${SITE}/pets/${murka.id}/health/new?type=weight&from=form`)
      await settle(page)
      checks.fromFormWithHistory = {
        weights,
        weightField: await page.inputValue(WEIGHT),
        dayField: await page.inputValue('.weight-form input[type=date]'),
        datingHint: (await page.textContent('main')).includes('анкет'),
      }
      await page.close()
    }

    // B-m4: «Все сроки» after «Состоялся» pressed there.
    {
      const page = await ctx.newPage()
      const visit = (await (await api(`/pets/${murka.id}/health`)).json()).events.find((event) => event.kind === 'visit')
      await page.goto(`${SITE}/pets/${murka.id}/health/due?saved=held&record=${visit.id}`)
      await settle(page)
      checks.dueHeld = { notice: text(await page.textContent('.health-saved')) }
      if (width === 1440) await shot(page, `due-held-notice-${width}`)
      await page.goto(`${SITE}/pets/${murka.id}/health/due?saved=completed`)
      await settle(page)
      checks.dueCompleted = { notice: text(await page.textContent('.health-saved')) }
      await page.close()
    }

    out.checks[width] = checks
    await signing.close()
    await ctx.close()
  }
} finally {
  await browser.close()
}

console.log(JSON.stringify(out, null, 2))
