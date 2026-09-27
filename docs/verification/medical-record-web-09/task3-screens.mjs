/**
 * MW-09 Task 3, in the browser: «Сделано» as its own confirmed step; a save
 * returns to where the form was opened, with the record in the notice; the
 * browser's Back over a form with changes; the owner's day moving on at
 * midnight; an edit form refreshed underneath while the owner types; the
 * owner's own name suggesting a next date; removing an item; the weight
 * period announced; the pet's check history.
 *
 * Needs the local stack, the site on http://localhost:3100 («web-local»),
 * the fixture owners, freshly seeded demo pets
 * (apps/web/scripts/seed-medical-record-demo.mjs), Playwright and Chrome:
 *
 *   PLAYWRIGHT=/path/to/node_modules/playwright \
 *   CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *   node docs/verification/medical-record-web-09/task3-screens.mjs > docs/verification/medical-record-web-09/task3-screens-output.json
 *
 * Writes PNGs next to this file and prints JSON. Local only. It writes to
 * the local database through the site and the API (marks plans done, adds
 * vaccinations and a weighing): seed the demo again afterwards.
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
const overview = async (petId) => (await api(`/pets/${petId}/health`)).json()

const ZONE = 'Europe/Moscow'
const today = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date())
const plus = (day, days) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
const text = (value) => (value ?? '').replace(/\s+/g, ' ').trim()
const shot = (page, name, full = true) => page.screenshot({ path: resolve(here, `${name}.png`), fullPage: full })
const out = { today, murka: murka.id, bobik: bobik.id, checks: {} }

const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true })
async function context(width) {
  return browser.newContext({ viewport: { width, height: width > 760 ? 1000 : 844 }, deviceScaleFactor: 1, locale: 'ru-RU', timezoneId: ZONE })
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
const focused = (page) =>
  page.evaluate(() => {
    const el = document.activeElement
    return { tag: el?.tagName.toLowerCase(), text: (el?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80), id: el?.id ?? '', label: el?.getAttribute('aria-label') ?? '' }
  })
const historyLength = (page) => page.evaluate(() => window.history.length)

try {
  // ----- «Сделано»: its own step, a confirmation naming the item and the day (1440) -----
  {
    const ctx = await context(1440)
    const page = await ctx.newPage()
    await signIn(page, `/pets/${murka.id}/health/due`)
    await settle(page)
    const first = page.locator('main .due-done').first()
    const firstLabel = await first.getAttribute('aria-label')
    await Promise.all([page.waitForURL(/\/complete\?/), first.click()])
    await settle(page)
    await page.waitForSelector('.complete-form')
    const hint = text(await page.textContent('.complete-form .event-item-next .field-hint'))
    const warning = text(await page.textContent('.complete-form .event-form-warning'))
    await shot(page, 'complete-form-1440')
    await page.click('.complete-form button[type=submit]')
    await page.waitForSelector('[role=dialog]')
    const dialog = { title: text(await page.textContent('[role=dialog] h2')), body: text(await page.textContent('[role=dialog] p')), focus: await focused(page) }
    await shot(page, 'complete-confirm-1440', false)
    await page.keyboard.press('Escape')
    await page.waitForSelector('[role=dialog]', { state: 'detached' })
    const afterEscape = { dialogGone: (await page.$('[role=dialog]')) === null, focus: await focused(page), url: new URL(page.url()).pathname }
    await page.click('.complete-form button[type=submit]')
    await page.waitForSelector('[role=dialog]')
    await Promise.all([page.waitForURL(/\/health\/due\?saved=completed&record=/), page.click('[role=dialog] button.btn.primary')])
    const landed = new URL(page.url())
    await page.waitForSelector('.health-saved')
    await page.waitForLoadState('networkidle').catch(() => {})
    const notice = { text: text(await page.textContent('.health-saved')), link: await page.getAttribute('.health-saved-link', 'href'), focus: await focused(page), urlAfter: new URL(page.url()).search }
    await shot(page, 'complete-saved-due-1440')
    await Promise.all([page.waitForURL((url) => url.pathname === notice.link), page.click('.health-saved-link')])
    await settle(page)
    out.checks.complete1440 = {
      dueLabel: firstLabel,
      hint,
      warning,
      dialog,
      afterEscape,
      landedOn: landed.pathname + landed.search,
      recordParam: landed.searchParams.get('record'),
      notice,
      openedRecord: { path: new URL(page.url()).pathname, heading: text(await page.textContent('main h1')) },
    }
    await ctx.close()
  }

  // ----- The same at 390: the form, its question; «Сделано» on one item of a plan of two, back to the plan -----
  {
    const ctx = await context(390)
    const page = await ctx.newPage()
    const plan = (await overview(murka.id)).events.find((event) => event.kind === 'vaccination' && event.status === 'planned' && event.items.length === 2)
    await signIn(page, `/pets/${murka.id}/health/${plan.id}`)
    await settle(page)
    await page.goto(`${SITE}/pets/${murka.id}/health/${plan.id}/complete?item=${plan.items[0].id}`)
    await settle(page)
    await page.waitForSelector('.complete-form')
    await shot(page, 'complete-form-390')
    await page.click('.complete-form button[type=submit]')
    await page.waitForSelector('[role=dialog]')
    await shot(page, 'complete-confirm-390', false)
    await Promise.all([page.waitForURL(new RegExp(`/health/${plan.id}\\?saved=completed&record=`)), page.click('[role=dialog] button.btn.primary')])
    const landed = new URL(page.url())
    await page.waitForSelector('.health-saved')
    await page.waitForLoadState('networkidle').catch(() => {})
    await shot(page, 'complete-saved-plan-390')
    out.checks.complete390 = {
      landedOn: landed.pathname + landed.search,
      samePlan: landed.pathname.endsWith(plan.id),
      notice: text(await page.textContent('.health-saved')),
      link: await page.getAttribute('.health-saved-link', 'href'),
      linkHeight: await page.$eval('.health-saved-link', (el) => el.getBoundingClientRect().height),
      scrollsSideways: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    }
    await ctx.close()
  }

  // ----- A new vaccination: the owner's own name gets the usual interval; removing an item; the section after saving -----
  for (const width of [1440, 390]) {
    const ctx = await context(width)
    const page = await ctx.newPage()
    await signIn(page, `/pets/${murka.id}/health/vaccinations`)
    await settle(page)
    await Promise.all([page.waitForURL(/\/health\/new\?type=vaccination/), page.click('main .pagehead a.btn.primary')])
    await settle(page)
    const combo = page.locator('input[role=combobox]')
    for (const name of ['Своя вакцина', 'Вторая своя']) {
      await combo.click()
      await combo.fill(name)
      await page.locator('.catalog-option.catalog-action', { hasText: 'Нет в списке' }).click()
      await page.waitForTimeout(50)
    }
    const items = await page.$$eval('.event-item', (sections) =>
      sections.map((section) => ({
        name: section.querySelector('input[type=text]')?.value ?? '',
        next: section.querySelector('input[type=date]')?.value ?? '',
        hint: (section.querySelector('.event-item-next .field-hint')?.textContent ?? '').trim(),
      })),
    )
    await shot(page, `vaccine-own-name-${width}`)
    // Remove the first: focus goes to the one that took its place, and the catalogue stays closed.
    await page.locator('.event-item').first().locator('.event-item-remove').click()
    await page.waitForTimeout(50)
    const afterRemove = { focus: await focused(page), comboboxExpanded: await combo.getAttribute('aria-expanded'), items: await page.locator('.event-item').count() }
    await page.locator('.event-item').first().locator('.event-item-remove').click()
    await page.waitForTimeout(50)
    const afterLast = { focus: await focused(page), comboboxExpanded: await combo.getAttribute('aria-expanded') }
    await combo.click()
    await combo.fill(`Своя ${width}`)
    await page.locator('.catalog-option.catalog-action', { hasText: 'Нет в списке' }).click()
    await Promise.all([page.waitForURL(/\/health\/vaccinations\?saved=added&record=/), page.click('.event-form button[type=submit]')])
    const landed = new URL(page.url())
    await page.waitForSelector('.health-saved')
    await page.waitForLoadState('networkidle').catch(() => {})
    await shot(page, `vaccine-saved-section-${width}`)
    const notice = { text: text(await page.textContent('.health-saved')), link: await page.getAttribute('.health-saved-link', 'href') }
    await Promise.all([page.waitForURL((url) => url.pathname === notice.link), page.click('.health-saved-link')])
    await settle(page)
    out.checks[`ownName${width}`] = {
      items,
      afterRemove,
      afterLast,
      landedOn: landed.pathname + landed.search,
      notice,
      openedRecord: { heading: text(await page.textContent('main h1')), next: text(await page.textContent('main').then((body) => (/Следующ[^\n]{0,60}/.exec(body) ?? [''])[0])) },
    }
    await ctx.close()
  }

  // ----- The browser's Back over a form with changes -----
  for (const width of [1440, 390]) {
    const ctx = await context(width)
    const page = await ctx.newPage()
    await signIn(page, `/pets/${bobik.id}/health/weight`)
    await settle(page)
    const start = await historyLength(page)
    await Promise.all([page.waitForURL(/\/health\/new\?type=weight/), page.click('main .pagehead a.btn.primary')])
    await settle(page)
    const formUrl = page.url()
    await page.fill('.weight-form input[inputmode=decimal]', '29')
    await page.waitForTimeout(100)
    await page.goBack({ waitUntil: 'commit' }).catch(() => {})
    await page.waitForSelector('[role=dialog]')
    const asked = { url: page.url() === formUrl, title: text(await page.textContent('[role=dialog] h2')), focus: await focused(page), weight: await page.inputValue('.weight-form input[inputmode=decimal]') }
    await shot(page, `back-guard-${width}`, false)
    await page.click('[role=dialog] button.btn.secondary') // «Остаться»
    await page.waitForSelector('[role=dialog]', { state: 'detached' })
    const stayed = { url: page.url() === formUrl, weight: await page.inputValue('.weight-form input[inputmode=decimal]') }
    await page.goBack({ waitUntil: 'commit' }).catch(() => {})
    await page.waitForSelector('[role=dialog]')
    const askedAgain = page.url() === formUrl
    await Promise.all([page.waitForURL((url) => url.pathname.endsWith('/health/weight')), page.click('[role=dialog] button.btn.primary')]) // «Уйти»
    await settle(page)
    const left = new URL(page.url()).pathname

    // Saved: back is the form once, then the page before it — no extra entry left behind.
    await Promise.all([page.waitForURL(/\/health\/new\?type=weight/), page.click('main .pagehead a.btn.primary')])
    await settle(page)
    await page.fill('.weight-form input[inputmode=decimal]', '29')
    const day = plus(today, -(width === 1440 ? 3 : 4))
    await page.fill('.weight-form input[type=date]', day)
    await Promise.all([page.waitForURL(/\/health\/weight\?saved=added/), page.click('.weight-form button[type=submit]')])
    await settle(page)
    const trail = [new URL(page.url()).pathname]
    await page.goBack()
    await page.waitForTimeout(400)
    trail.push(new URL(page.url()).pathname + new URL(page.url()).search)
    await page.goBack()
    await page.waitForTimeout(400)
    trail.push(new URL(page.url()).pathname + new URL(page.url()).search)

    // Clean again: one press of Back leaves.
    await page.goto(`${SITE}/pets/${bobik.id}/health/weight`)
    await settle(page)
    await Promise.all([page.waitForURL(/\/health\/new\?type=weight/), page.click('main .pagehead a.btn.primary')])
    await settle(page)
    await page.fill('.weight-form input[inputmode=decimal]', '29')
    await page.waitForTimeout(100)
    await page.fill('.weight-form input[inputmode=decimal]', '')
    await page.waitForTimeout(100)
    await page.goBack()
    await page.waitForTimeout(600)
    const cleanBack = { path: new URL(page.url()).pathname, dialog: (await page.$('[role=dialog]')) !== null }

    out.checks[`back${width}`] = { startLength: start, asked, stayed, askedAgain, left, afterSaveBackTrail: trail, cleanBack }
    await ctx.close()
  }

  // ----- Midnight: the page's day and a form's limits move on; nothing typed is lost -----
  for (const width of [1440, 390]) {
    const ctx = await context(width)
    const page = await ctx.newPage()
    await page.clock.install({ time: new Date() })
    await signIn(page, `/pets/${bobik.id}/health/new?type=weight`)
    await settle(page)
    await page.fill('.weight-form input[inputmode=decimal]', '31,5')
    const before = { max: await page.getAttribute('.weight-form input[type=date]', 'max'), day: await page.inputValue('.weight-form input[type=date]') }
    // To one second past the owner's midnight.
    const now = await page.evaluate(() => Date.now())
    const midnight = Date.parse(`${plus(today, 1)}T00:00:01+03:00`)
    await page.clock.fastForward(midnight - now)
    await page.waitForTimeout(300)
    const after = {
      max: await page.getAttribute('.weight-form input[type=date]', 'max'),
      day: await page.inputValue('.weight-form input[type=date]'),
      weight: await page.inputValue('.weight-form input[inputmode=decimal]'),
    }
    await shot(page, `midnight-weight-form-${width}`)
    // The due dates count from the new day too.
    await page.goto(`${SITE}/pets/${murka.id}/health/due`)
    await settle(page)
    const dueBefore = await page.$$eval('main .due-row, main li', (rows) => rows.map((row) => row.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 3))
    const now2 = await page.evaluate(() => Date.now())
    await page.clock.fastForward(Date.parse(`${plus(today, 2)}T00:00:01+03:00`) - now2)
    await page.waitForTimeout(500)
    const dueAfter = await page.$$eval('main .due-row, main li', (rows) => rows.map((row) => row.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 3))
    out.checks[`midnight${width}`] = { before, after, expectedMax: plus(today, 1), dueBefore, dueAfter }
    await ctx.close()
  }

  // ----- An edit form refreshed underneath: kept while the owner types, and told -----
  for (const width of [1440, 390]) {
    const ctx = await context(width)
    const page = await ctx.newPage()
    const plan = (await overview(murka.id)).events.find((event) => event.kind === 'parasite' && event.status === 'planned')
    await signIn(page, `/pets/${murka.id}/health/${plan.id}`)
    await settle(page)
    // The next read of the record waits until the owner has typed.
    let release
    const gate = new Promise((resolve) => (release = resolve))
    await page.route(/\/api\/v1\/pets\/[^/]+\/health(\?|$)/, async (route) => {
      await gate
      await route.continue()
    })
    await Promise.all([page.waitForURL(/\/edit$/), page.click('main a[href$="/edit"]')])
    await page.waitForSelector('.event-form')
    await page.fill('.event-form textarea', 'Правка владельца')
    // Meanwhile on another device: the clinic of the plan changes.
    await api(`/pets/${murka.id}/health/events/${plan.id}`, { method: 'PATCH', body: JSON.stringify({ clinic: `Клиника с другого устройства ${width}` }) })
    release()
    await page.waitForSelector('.health-drift')
    const drift = { text: text(await page.textContent('.health-drift')), notes: await page.inputValue('.event-form textarea'), clinic: await page.inputValue(`.event-form input[id$="-clinic"]`) }
    await shot(page, `drift-notice-${width}`)
    await page.unroute(/\/api\/v1\/pets\/[^/]+\/health(\?|$)/)
    await page.click('.health-drift button')
    await page.waitForSelector('.health-drift', { state: 'detached' })
    const taken = { notes: await page.inputValue('.event-form textarea'), clinic: await page.inputValue(`.event-form input[id$="-clinic"]`) }
    out.checks[`drift${width}`] = { drift, taken }
    await ctx.close()
  }

  // ----- The weight period is announced; the pet's check history -----
  for (const width of [1440, 390]) {
    const ctx = await context(width)
    const page = await ctx.newPage()
    await signIn(page, `/pets/${murka.id}/health/weight`)
    await settle(page)
    const live = page.locator('.weight-summary p.sr-only[aria-live=polite]')
    const beforeClick = await live.textContent()
    await page.click('.weight-periods button:text-is("Год")')
    await page.waitForTimeout(100)
    const afterClick = text(await live.textContent())
    await page.goto(`${SITE}/checks?pet=${murka.id}`)
    await settle(page)
    await shot(page, `pet-history-${width}`)
    out.checks[`weightAndHistory${width}`] = {
      liveRegionBefore: beforeClick,
      liveRegionAfter: afterClick,
      history: { heading: text(await page.textContent('main h1')), subtitle: text(await page.textContent('main .pagehead p')), back: await page.getAttribute('main .pagehead a', 'href'), cards: await page.locator('main .history-month a').count() },
    }
    // A banner's helper link is a 44px target.
    out.checks[`bannerLink${width}`] = await page.evaluate(() => {
      const banner = document.createElement('div')
      banner.className = 'banner error record-form-error event-form-banner'
      banner.innerHTML = '<p>x</p><a class="link" href="#">В раздел</a>'
      document.querySelector('main')?.append(banner)
      const height = banner.querySelector('a').getBoundingClientRect().height
      banner.remove()
      return { height }
    })
    await ctx.close()
  }
} finally {
  await browser.close()
}

console.log(JSON.stringify(out, null, 2))
