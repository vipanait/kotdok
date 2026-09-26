/**
 * MW-04 acceptance run against the local stack: screenshots and checks for
 * docs/verification/medical-record-web-04.md.
 *
 * Needs: the local Supabase stack, the site on http://localhost:3100 started
 * with apps/web/.env.integration (.claude/launch.json «web-local»), freshly
 * seeded demo pets and draft catalogue (apps/web/scripts/seed-medical-record-demo.mjs
 * — the run adds, completes and cancels records), Playwright and Chrome:
 *
 *   PLAYWRIGHT=/path/to/node_modules/playwright \
 *   CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *   node docs/verification/medical-record-web-04/verify.mjs
 *
 * Writes PNGs next to this file and prints a JSON summary. Local only: it
 * refuses any origin that is not localhost.
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
const password = /FIXTURE_PASSWORD = '([^']+)'/.exec(readFileSync(resolve(root, 'apps/web/tests/integration/fixtures.ts'), 'utf8'))[1]

async function token(email) {
  const response = await fetch(`${env.TEST_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.TEST_SUPABASE_ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return (await response.json()).access_token
}

async function api(path, bearer, init = {}) {
  const response = await fetch(`${SITE}/api/v1${path}`, {
    ...init,
    headers: {
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  })
  return { status: response.status, body: await response.json().catch(() => null) }
}

const tokenA = await token('owner-a@fixture.local')
const tokenB = await token('owner-b@fixture.local')
const pets = (await api('/pets', tokenA)).body
const DEMO_NOTE = 'Демо медкарты (seed-medical-record-demo)'
const murka = pets.find((pet) => pet.name === 'Мурка' && pet.notes === DEMO_NOTE)
const bobik = pets.find((pet) => pet.name === 'Бобик' && pet.notes === DEMO_NOTE)
if (!murka || !bobik) throw new Error('Seed the demo pets first (apps/web/scripts/seed-medical-record-demo.mjs)')

const events = async (petId = murka.id) => (await api(`/pets/${petId}/health`, tokenA)).body.events
const dueOf = async (petId = murka.id) => (await api('/pets/due', tokenA)).body.filter((entry) => entry.pet_id === petId)
const doneSnapshot = async () =>
  JSON.stringify((await events()).filter((event) => event.status === 'done').sort((a, b) => a.id.localeCompare(b.id)))

const seeded = await events()
const fleaPlan = seeded.find((event) => event.kind === 'parasite' && event.status === 'planned' && event.date === '2026-09-12')
const wormPlan = seeded.find((event) => event.kind === 'parasite' && event.status === 'planned' && event.date === '2026-10-05')
const vaccinePlan = seeded.find((event) => event.kind === 'vaccination' && event.status === 'planned')
if (!fleaPlan || fleaPlan.items[0].interval?.unit !== 'week' || !wormPlan || !vaccinePlan) {
  throw new Error('The seeded plans are not as expected; seed again')
}

// The owner's day in the browser's zone (Europe/Moscow below), as the forms count it.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date())
const plusDays = (day, days) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true })
const summary = { site: SITE, today, murka: murka.id, bobik: bobik.id, checks: {} }
const consoleErrors = []

async function signedInPage(email, width = 1440, options = {}) {
  const context = await browser.newContext({
    viewport: { width, height: width > 760 ? 1000 : 844 },
    deviceScaleFactor: 1,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    ...options,
  })
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`${email}: ${message.text()}`)
  })
  await page.goto(`${SITE}/login`)
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', password)
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login')), page.press('input[type=password]', 'Enter')])
  return { context, page }
}

const text = (value) => (value ?? '').replace(/\s+/g, ' ').trim()
const settle = (page) => page.evaluate(() => document.fonts.ready)
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
const shot = (page, name, fullPage = true) => page.screenshot({ path: resolve(here, `${name}.png`), fullPage })

async function phoneFullShot(page, name) {
  const style = await page.addStyleTag({ content: 'body{position:relative}.mobile-nav{position:absolute!important}' })
  await shot(page, name)
  await style.evaluate((node) => node.remove())
}

const focused = (page) =>
  page.evaluate(() => {
    const el = document.activeElement
    return el ? `${el.tagName.toLowerCase()} ${(el.getAttribute('aria-label') || el.labels?.[0]?.textContent || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80)}` : null
  })

async function open(page, path, selector) {
  await page.goto(`${SITE}${path}`)
  await page.waitForSelector(selector, { timeout: 60_000 })
  await settle(page)
}

/** The due rows as the owner reads them, and what colour says alongside the words. */
const dueRows = (page, scope = '.health-due') =>
  page.$$eval(`${scope} .due-row`, (rows) =>
    rows.map((row) => {
      const state = row.querySelector('.due-state')
      return {
        title: row.querySelector('strong')?.textContent ?? null,
        status: state?.textContent.trim() ?? null,
        tone: state?.className.replace('due-state', '').trim() ?? null,
        icon: !!state?.querySelector('svg'),
        color: state ? getComputedStyle(state).color : null,
        done: row.querySelector('a.due-done')?.getAttribute('aria-label') ?? null,
        href: row.querySelector('a.due-done')?.getAttribute('href') ?? null,
      }
    }),
  )

const completeForm = (page) =>
  page.evaluate(() => ({
    url: location.pathname + location.search,
    title: document.querySelector('h1')?.textContent ?? null,
    planDay: document.querySelector('.complete-head .field-hint')?.textContent ?? null,
    doneOn: document.querySelector('.complete-form input[id$="-done"]')?.value ?? null,
    doneMax: document.querySelector('.complete-form input[id$="-done"]')?.getAttribute('max') ?? null,
    item: [...document.querySelectorAll('.complete-item-facts dd')].map((node) => node.textContent),
    next: document.querySelector('.complete-form input[id$="-next"]')?.value ?? null,
    hint: document.querySelector('.complete-form [id$="-next-hint"]')?.textContent ?? null,
    note: document.querySelector('.complete-note')?.textContent ?? null,
    warning: document.querySelector('.event-form-warning')?.textContent ?? null,
    banner: document.querySelector('.event-form-banner')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
  }))

const readRecord = (page) =>
  page.evaluate(() => ({
    url: location.pathname + location.search,
    badge: document.querySelector('.event-badge')?.textContent ?? null,
    day: document.querySelector('#event-record-day')?.textContent ?? null,
    items: [...document.querySelectorAll('.event-record-items li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()),
    actions: [...document.querySelectorAll('.pagehead a.btn, .event-actions button')].map((node) => node.textContent.trim()),
    notice: document.querySelector('.health-saved')?.textContent ?? null,
  }))

// ---------- Owner A, desktop ----------
{
  const { context, page } = await signedInPage('owner-a@fixture.local', 1440)
  const completes = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/health\/items\/[^/]+\/complete$/.test(new URL(request.url()).pathname)) {
      completes.push({ path: new URL(request.url()).pathname, key: request.headers()['idempotency-key'], body: request.postDataJSON() })
    }
  })

  // ----- The record's «Сроки»: first three, «Сделано», «Все сроки · N» -----
  await open(page, `/pets/${murka.id}`, '.health-due')
  summary.checks.recordDue = {
    rows: await dueRows(page),
    all: await page.$eval('.health-due > a.link', (link) => ({ text: link.textContent, href: link.getAttribute('href') })),
    urgencyBadgesInDue: await page.$$eval('.health-due .urgency-badge, .health-due [class*=urgency]', (nodes) => nodes.length),
  }
  await shot(page, 'medical-1440')

  // ----- «Все сроки» -----
  await open(page, `/pets/${murka.id}/health/due`, '.due-page')
  summary.checks.duePage = {
    title: text(await page.textContent('h1')),
    rows: await dueRows(page, '.due-list'),
    serverOrder: (await dueOf()).map((entry) => `${entry.date} ${entry.kind} ${entry.name ?? entry.targets.join('+')}`),
  }
  await shot(page, 'due-1440')

  // ----- The parasites section, and an empty one -----
  await open(page, `/pets/${murka.id}/health/parasites`, '.events-page')
  summary.checks.parasitesPage = await page.evaluate(() => ({
    title: document.querySelector('h1')?.textContent,
    subtitle: document.querySelector('.pagehead p')?.textContent,
    planned: [...document.querySelectorAll('#events-planned ~ ul .event-card')].map((card) => card.textContent.replace(/\s+/g, ' ').trim()),
    done: [...document.querySelectorAll('#events-done ~ ul .event-card')].map((card) => card.textContent.replace(/\s+/g, ' ').trim()),
    covers: [...document.querySelectorAll('.parasite-cover')].map((card) => ({
      text: card.textContent.replace(/\s+/g, ' ').trim(),
      done: card.querySelector('a')?.getAttribute('aria-label') ?? null,
    })),
  }))
  await shot(page, 'parasites-1440')
  await open(page, `/pets/${bobik.id}/health/parasites`, '.events-page')
  summary.checks.parasitesEmpty = await page.evaluate(() => ({
    empty: document.querySelector('.events-empty')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
    cards: document.querySelectorAll('.event-card').length,
    covers: [...document.querySelectorAll('.parasite-cover')].map((card) => card.textContent.replace(/\s+/g, ' ').trim()),
  }))
  await shot(page, 'parasites-empty-1440')

  // ----- A plan's page: «Сделано» and «Изменить» -----
  await open(page, `/pets/${murka.id}/health/${fleaPlan.id}`, '.event-record-page')
  summary.checks.fleaPlanRecord = await readRecord(page)
  await shot(page, 'parasite-plan-1440')

  // ----- «Сделано» on a vaccination plan of two: which one? One item only -----
  await open(page, `/pets/${murka.id}/health/${vaccinePlan.id}`, '.event-record-page')
  await page.click('.pagehead a:has-text("Сделано")')
  await page.waitForSelector('.complete-choose')
  await settle(page)
  summary.checks.chooser = {
    url: page.url().replace(SITE, ''),
    title: text(await page.textContent('h1')),
    focus: await focused(page),
    choices: await page.$$eval('.complete-choice', (links) => links.map((link) => `${link.textContent.replace(/\s+/g, ' ').trim()} → ${link.getAttribute('href')}`)),
  }
  await shot(page, 'planned-complete-1440')
  await page.setViewportSize({ width: 390, height: 844 })
  await shot(page, 'planned-complete-390', false)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.click('.complete-choice:has-text("Нобивак Rabies")')
  await page.waitForSelector('.complete-form')
  await settle(page)
  summary.checks.vaccineCompleteForm = await completeForm(page)
  await Promise.all([page.waitForURL(/\?saved=completed/), page.click('.complete-form button[type=submit]')])
  await page.waitForSelector('.event-record-page')
  await settle(page)
  summary.checks.vaccineCompleted = await readRecord(page)
  const afterVaccine = await events()
  const stillPlanned = afterVaccine.find((event) => event.id === vaccinePlan.id)
  summary.checks.vaccinePlanAfter = {
    status: stillPlanned?.status,
    date: stillPlanned?.date,
    items: stillPlanned?.items.map((item) => item.name),
    doneRabiesToday: afterVaccine.filter((event) => event.kind === 'vaccination' && event.status === 'done' && event.date === today).map((event) => event.items.map((item) => item.name)),
  }
  await shot(page, 'vaccine-completed-1440')

  // ----- MW-04.2: «Сделано» on the overdue flea plan, from «Все сроки» -----
  await open(page, `/pets/${murka.id}/health/due`, '.due-page')
  await page.click('.due-row:has(strong:text-is("Блохи и клещи")) a.due-done')
  await page.waitForSelector('.complete-form')
  await settle(page)
  const criterion2 = { defaults: await completeForm(page) }
  await page.fill('.complete-form input[id$="-done"]', '2026-09-24')
  criterion2.doneOn24 = await completeForm(page)
  summary.checks.criterion2 = criterion2
  await page.click('body', { position: { x: 5, y: 5 } })
  await shot(page, 'parasite-complete-1440')

  // ----- MW-04.4: the answer is lost; the retry sends the same key; no false success -----
  const doneBefore = await doneSnapshot()
  await page.route('**/api/v1/pets/*/health/items/*/complete', async (route) => {
    await route.fetch()
    await route.abort('internetdisconnected')
  })
  await page.click('.complete-form button[type=submit]')
  await page.waitForSelector('.event-form-banner')
  summary.checks.lostAnswer = {
    form: await completeForm(page),
    focus: await focused(page),
    stillOnForm: page.url().includes('/complete'),
    notice: !!(await page.$('.health-saved')),
    buttonUsable: await page.$eval('.complete-form button[type=submit]', (button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true'),
    savedOnServer: (await events()).filter((event) => event.kind === 'parasite' && event.status === 'done' && event.date === '2026-09-24').length,
  }
  await shot(page, 'complete-error-1440')
  await page.unroute('**/api/v1/pets/*/health/items/*/complete')
  await Promise.all([page.waitForURL(/\/health\/due\?saved=completed/), page.click('.complete-form button[type=submit]')])
  await page.waitForSelector('.due-page .health-saved')
  await settle(page)
  const afterFlea = await events()
  summary.checks.retry = {
    requests: completes.filter((request) => request.path.endsWith(`/items/${fleaPlan.items[0].id}/complete`)).map((request) => ({ key: request.key, body: request.body })),
    doneRecordsOn24: afterFlea.filter((event) => event.kind === 'parasite' && event.status === 'done' && event.date === '2026-09-24').length,
    planBecameDone: afterFlea.find((event) => event.id === fleaPlan.id)?.status,
    nextPlan: afterFlea
      .filter((event) => event.status === 'planned' && event.items.some((item) => item.source_item_id === fleaPlan.items[0].id))
      .map((event) => [event.date, event.items[0].interval]),
    notice: text(await page.textContent('.health-saved')),
    rows: await dueRows(page, '.due-list'),
  }
  summary.checks.retry.sameKey = new Set(summary.checks.retry.requests.map((request) => request.key)).size === 1
  summary.checks.otherDoneUnchanged = (() => {
    const before = JSON.parse(doneBefore)
    const now = afterFlea.filter((event) => event.status === 'done')
    return before.every((event) => JSON.stringify(now.find((other) => other.id === event.id)) === JSON.stringify(event))
  })()
  await shot(page, 'due-after-complete-1440')

  // The done record is only read now: no «Изменить», no «Сделано»; its /complete and /edit show it.
  await open(page, `/pets/${murka.id}/health/${fleaPlan.id}`, '.event-record-page')
  summary.checks.fleaDoneRecord = await readRecord(page)
  await shot(page, 'parasite-done-record-1440')
  for (const suffix of ['complete', 'edit']) {
    await page.goto(`${SITE}/pets/${murka.id}/health/${fleaPlan.id}/${suffix}`)
    await page.waitForSelector('.event-record-page')
    summary.checks[`doneRecord_${suffix}Url`] = page.url().replace(SITE, '')
  }
  summary.checks.donePatch = (await api(`/pets/${murka.id}/health/events/${fleaPlan.id}`, tokenA, { method: 'PATCH', body: JSON.stringify({ clinic: 'Другая' }) })).status

  // ----- MW-04.1: two treatments with different next dates; «Сделано» on one -----
  await open(page, `/pets/${murka.id}/health/new?type=parasite`, '.event-form')
  summary.checks.newTreatmentTitle = text(await page.textContent('h1'))
  for (const name of ['Бравекто Спот-он', 'Мильбемакс']) {
    await page.click('[role=combobox]')
    await page.fill('[role=combobox]', name.slice(0, 6))
    await page.waitForSelector(`.catalog-option:has(strong:text-is("${name}"))`)
    await page.click(`.catalog-option:has(strong:text-is("${name}"))`)
  }
  summary.checks.newTreatmentItems = await page.$$eval('.event-item', (cards) =>
    cards.map((card) => ({
      title: card.querySelector('.event-item-title')?.textContent,
      pressed: [...card.querySelectorAll('.chip[aria-pressed=true]')].map((chip) => chip.textContent),
      next: card.querySelector('.event-item-next input')?.value,
    })),
  )
  await page.click('body', { position: { x: 5, y: 5 } })
  await shot(page, 'parasite-done-1440')
  await Promise.all([page.waitForURL(/\?saved=added/), page.click('.event-form button[type=submit]')])
  await page.waitForSelector('.event-record-page')
  const twoSaved = await readRecord(page)
  const twoId = twoSaved.url.split('/').pop().split('?')[0]
  const allNow = await events()
  const twoRecord = allNow.find((event) => event.id === twoId)
  const plansFromTwo = twoRecord.items.map((item) => allNow.find((event) => event.status === 'planned' && event.items.some((other) => other.source_item_id === item.id)))
  summary.checks.criterion1 = {
    saved: twoSaved,
    plans: plansFromTwo.map((plan) => ({ id: plan.id, date: plan.date, item: plan.items[0].name })),
    differentDates: plansFromTwo[0].date !== plansFromTwo[1].date,
  }

  await open(page, `/pets/${murka.id}/health/due`, '.due-page')
  summary.checks.criterion1.dueBefore = await dueRows(page, '.due-list')
  const spotOnPlan = plansFromTwo[0]
  const spotOnRow = `.due-row:has(a.due-done[href*="item=${spotOnPlan.items[0].id}"])`
  await page.click(`${spotOnRow} a.due-done`)
  await page.waitForSelector('.complete-form')
  await settle(page)
  await page.click('.complete-form .event-next-clear')
  summary.checks.criterion1.form = await completeForm(page)
  // Pending: three presses, one request.
  await page.route('**/api/v1/pets/*/health/items/*/complete', async (route) => {
    await new Promise((done) => setTimeout(done, 1200))
    await route.continue()
  })
  const pressesBefore = completes.length
  await page.click('.complete-form button[type=submit]')
  await page.waitForSelector('.complete-form button[aria-disabled=true]')
  summary.checks.pending = { label: text(await page.textContent('.complete-form button[type=submit]')), busy: await page.getAttribute('.complete-form', 'aria-busy') }
  await page.click('.complete-form button[type=submit]', { force: true })
  await page.click('.complete-form button[type=submit]', { force: true })
  await page.waitForURL(/\/health\/due\?saved=completed/)
  await page.unroute('**/api/v1/pets/*/health/items/*/complete')
  summary.checks.pending.requests = completes.length - pressesBefore
  await page.waitForSelector('.due-page .health-saved')
  await settle(page)
  const afterOne = await events()
  summary.checks.criterion1.after = {
    rows: await dueRows(page, '.due-list'),
    spotOnPlanNow: afterOne.find((event) => event.id === spotOnPlan.id)?.status,
    otherStillDue: (await dueOf()).some((entry) => entry.event_id === plansFromTwo[1].id && entry.date === plansFromTwo[1].date),
    firstRecordUnchanged: JSON.stringify(afterOne.find((event) => event.id === twoId)) === JSON.stringify(twoRecord),
  }
  await shot(page, 'due-criterion1-1440')

  // ----- MW-04.4: a server error keeps the form open; a plan gone meanwhile says so -----
  await open(page, `/pets/${murka.id}/health/parasites`, '.events-page')
  await page.click('.parasite-cover:has(h2:text-is("Глисты")) a:has-text("Сделано")')
  await page.waitForSelector('.complete-form')
  await settle(page)
  summary.checks.fromSection = { url: page.url().replace(SITE, ''), form: await completeForm(page) }
  const beforeFailure = JSON.stringify(await events())
  await page.route('**/api/v1/pets/*/health/items/*/complete', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'dependency_unavailable', message: 'down', request_id: 'verify' } }) }),
  )
  await page.click('.complete-form button[type=submit]')
  await page.waitForSelector('.event-form-banner')
  summary.checks.serverError = {
    banner: text(await page.textContent('.event-form-banner')),
    stillOnForm: page.url().includes('/complete'),
    notice: !!(await page.$('.health-saved')),
    unchanged: JSON.stringify(await events()) === beforeFailure,
  }
  await page.unroute('**/api/v1/pets/*/health/items/*/complete')
  // The plan is cancelled on another device; «Сохранить» here gets 404.
  await api(`/pets/${murka.id}/health/events/${wormPlan.id}`, tokenA, { method: 'DELETE' })
  const beforeGone = JSON.stringify(await events())
  await page.click('.complete-form button[type=submit]')
  await page.waitForFunction(() => document.querySelector('.event-form-banner')?.textContent.includes('больше нет'))
  summary.checks.goneMeanwhile = {
    banner: text(await page.textContent('.event-form-banner')),
    stillOnForm: page.url().includes('/complete'),
    unchanged: JSON.stringify(await events()) === beforeGone,
  }
  await shot(page, 'complete-gone-1440')

  // ----- MW-04.3: cancelling a plan takes only its due date -----
  const cancelPlan = plansFromTwo[1]
  const doneBeforeCancel = await doneSnapshot()
  const dueBeforeCancel = (await dueOf()).map((entry) => entry.event_id)
  await open(page, `/pets/${murka.id}/health/${cancelPlan.id}`, '.event-record-page')
  await page.click('.event-actions button')
  await page.waitForSelector('.modal')
  summary.checks.cancelDialog = { title: text(await page.textContent('.modal h2')), body: text(await page.textContent('.modal p')), focus: await focused(page) }
  await shot(page, 'cancel-dialog-1440', false)
  await page.click('.modal button:has-text("Оставить план")')
  summary.checks.cancelKept = { focus: await focused(page), dialog: !!(await page.$('.modal')), stillThere: (await events()).some((event) => event.id === cancelPlan.id) }
  await page.click('.event-actions button')
  await page.waitForSelector('.modal')
  await page.keyboard.press('Escape')
  summary.checks.cancelEscape = { focus: await focused(page), stillThere: (await events()).some((event) => event.id === cancelPlan.id) }
  await page.click('.event-actions button')
  await page.click('.modal button:text-is("Отменить план")')
  await page.waitForURL(/\/health\/parasites\?saved=cancelled|\/health\/parasites$/)
  await page.waitForSelector('.events-page')
  const dueAfterCancel = (await dueOf()).map((entry) => entry.event_id)
  summary.checks.criterion3 = {
    notice: text(await page.textContent('.health-saved')),
    removedFromDue: dueBeforeCancel.filter((id) => !dueAfterCancel.includes(id)),
    expected: [cancelPlan.id],
    otherDueKept: dueBeforeCancel.filter((id) => id !== cancelPlan.id).every((id) => dueAfterCancel.includes(id)),
    doneHistoryUnchanged: (await doneSnapshot()) === doneBeforeCancel,
  }
  await shot(page, 'parasites-after-cancel-1440')

  // Unknown and closed addresses.
  summary.checks.notFoundRoutes = {}
  for (const path of [`/pets/${murka.id}/health/00000000-0000-4000-8000-000000000000/complete`, `/pets/${murka.id}/health/visits`]) {
    await page.goto(`${SITE}${path}`)
    await page.waitForLoadState('networkidle')
    summary.checks.notFoundRoutes[path] = { h1: text(await page.textContent('h1').catch(() => '')), form: !!(await page.$('.complete-form, .event-record-page')) }
  }
  await context.close()
}

// ---------- «Сегодня» is the owner's day: the day boundary and the zone ----------
{
  // The last whole UTC hour, and the zone where it is local midnight: just before
  // it the owner's today is one day, just after — the next. Behind the real clock,
  // so the session stays valid.
  const ZONES = {
    0: 'Africa/Abidjan', 1: 'Africa/Lagos', 2: 'Africa/Johannesburg', 3: 'Europe/Moscow', 4: 'Asia/Dubai', 5: 'Asia/Tashkent',
    6: 'Asia/Dhaka', 7: 'Asia/Bangkok', 8: 'Asia/Shanghai', 9: 'Asia/Tokyo', 10: 'Australia/Brisbane', 11: 'Pacific/Noumea',
    12: 'Pacific/Tarawa', 13: 'Pacific/Tongatapu', 14: 'Pacific/Kiritimati', [-1]: 'Atlantic/Cape_Verde', [-2]: 'America/Noronha',
    [-3]: 'America/Argentina/Buenos_Aires', [-4]: 'America/La_Paz', [-5]: 'America/Bogota', [-6]: 'America/Guatemala',
    [-7]: 'America/Phoenix', [-8]: 'Pacific/Pitcairn', [-9]: 'Pacific/Gambier', [-10]: 'Pacific/Honolulu', [-11]: 'Pacific/Pago_Pago',
  }
  const hour = new Date()
  hour.setUTCMinutes(0, 0, 0)
  let offset = (24 - hour.getUTCHours()) % 24
  if (offset > 14) offset -= 24
  const zone = ZONES[offset]
  const openPlan = (await events()).find((event) => event.status === 'planned' && event.kind !== 'visit')
  const boundary = { zone, midnightUtc: hour.toISOString() }
  for (const [label, moment] of [['before', new Date(hour.getTime() - 30_000)], ['after', new Date(hour.getTime() + 30_000)]]) {
    const { context, page } = await signedInPage('owner-a@fixture.local', 1440, { timezoneId: zone })
    await page.clock.setFixedTime(moment)
    await open(page, `/pets/${murka.id}/health/${openPlan.id}/complete?item=${openPlan.items[0].id}`, '.complete-form')
    boundary[label] = { local: new Intl.DateTimeFormat('ru-RU', { timeZone: zone, dateStyle: 'short', timeStyle: 'medium' }).format(moment), ...(await completeForm(page)) }
    await context.close()
  }
  summary.checks.dayBoundary = boundary

  // One moment, two owners: Kiritimati (UTC+14) is a day ahead of Los Angeles for ten hours of every day.
  const moment = new Date()
  moment.setUTCHours(11, 0, 0, 0)
  if (moment > new Date()) moment.setUTCDate(moment.getUTCDate() - 1)
  const zones = {}
  for (const tz of ['Pacific/Kiritimati', 'America/Los_Angeles', 'Europe/Moscow']) {
    const { context, page } = await signedInPage('owner-a@fixture.local', 1440, { timezoneId: tz })
    await page.clock.setFixedTime(moment)
    await open(page, `/pets/${murka.id}/health/${openPlan.id}/complete?item=${openPlan.items[0].id}`, '.complete-form')
    zones[tz] = (await completeForm(page)).doneOn
    await context.close()
  }
  summary.checks.zones = { moment: moment.toISOString(), doneOnDefault: zones }
}

// ---------- Owner A, phone ----------
{
  const { context, page } = await signedInPage('owner-a@fixture.local', 390)
  const planned = (await events()).find((event) => event.kind === 'parasite' && event.status === 'planned')
  summary.checks.overflow390 = {}
  await open(page, `/pets/${murka.id}`, '.health-due')
  summary.checks.overflow390.record = await overflow(page)
  await shot(page, 'medical-390', false)
  await open(page, `/pets/${murka.id}/health/due`, '.due-page')
  summary.checks.overflow390.due = await overflow(page)
  summary.checks.dueDoneSize390 = await page.$$eval('a.due-done', (links) => links.map((link) => Math.round(link.getBoundingClientRect().height)))
  await phoneFullShot(page, 'due-390-full')
  await open(page, `/pets/${murka.id}/health/parasites`, '.events-page')
  summary.checks.overflow390.parasites = await overflow(page)
  await shot(page, 'parasites-390', false)
  await phoneFullShot(page, 'parasites-390-full')
  await open(page, `/pets/${bobik.id}/health/parasites`, '.events-page')
  summary.checks.overflow390.parasitesEmpty = await overflow(page)
  await phoneFullShot(page, 'parasites-empty-390-full')
  await open(page, `/pets/${murka.id}/health/${planned.id}`, '.event-record-page')
  summary.checks.overflow390.plan = await overflow(page)
  await phoneFullShot(page, 'parasite-plan-390-full')
  await open(page, `/pets/${murka.id}/health/${planned.id}/complete?item=${planned.items[0].id}`, '.complete-form')
  summary.checks.overflow390.complete = await overflow(page)
  await phoneFullShot(page, 'parasite-complete-390-full')
  await open(page, `/pets/${murka.id}/health/new?type=parasite`, '.event-form')
  summary.checks.overflow390.newTreatment = await overflow(page)
  await phoneFullShot(page, 'parasite-new-390-full')
  await context.close()
}

// ---------- Other widths ----------
{
  const { context, page } = await signedInPage('owner-a@fixture.local', 1440)
  const planned = (await events()).find((event) => event.kind === 'parasite' && event.status === 'planned')
  summary.checks.overflowByWidth = {}
  for (const width of [1150, 1024, 900, 768, 760, 360, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await open(page, `/pets/${murka.id}/health/due`, '.due-page')
    summary.checks.overflowByWidth[`due ${width}`] = await overflow(page)
    await open(page, `/pets/${murka.id}/health/parasites`, '.events-page')
    summary.checks.overflowByWidth[`parasites ${width}`] = await overflow(page)
    await open(page, `/pets/${murka.id}/health/${planned.id}/complete?item=${planned.items[0].id}`, '.complete-form')
    summary.checks.overflowByWidth[`complete ${width}`] = await overflow(page)
    await open(page, `/pets/${murka.id}`, '.health-due')
    summary.checks.overflowByWidth[`record ${width}`] = await overflow(page)
  }
  await context.close()
}

// ---------- Owner B: someone else's treatments and due dates ----------
{
  const before = await events()
  const planned = before.find((event) => event.kind === 'parasite' && event.status === 'planned')
  const { context, page } = await signedInPage('owner-b@fixture.local', 1440)
  const requests = []
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/')) requests.push(request.url())
  })
  summary.checks.foreignPages = {}
  for (const path of [
    `/pets/${murka.id}/health/parasites`,
    `/pets/${murka.id}/health/due`,
    `/pets/${murka.id}/health/${planned.id}`,
    `/pets/${murka.id}/health/${planned.id}/complete?item=${planned.items[0].id}`,
    `/pets/${murka.id}/health/new?type=parasite`,
  ]) {
    const response = await page.goto(`${SITE}${path}`)
    await page.waitForLoadState('networkidle')
    const html = await page.content()
    summary.checks.foreignPages[path] = {
      status: response.status(),
      h1: text(await page.textContent('h1').catch(() => '')),
      shown: !!(await page.$('.events-page, .event-form, .event-record-page, .complete-form, .due-page')),
      leaks: ['Бравекто', 'Мильбемакс', 'Айболит', 'Мурка · '].filter((word) => html.includes(word)),
    }
  }
  summary.checks.foreignApiRequests = requests
  await shot(page, 'foreign-due-1440')
  await context.close()

  summary.checks.foreignApi = {
    complete: (await api(`/pets/${murka.id}/health/items/${planned.items[0].id}/complete`, tokenB, {
      method: 'POST',
      body: JSON.stringify({ done_on: today }),
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    })).status,
    cancel: (await api(`/pets/${murka.id}/health/events/${planned.id}`, tokenB, { method: 'DELETE' })).status,
    dueHasA: ((await api('/pets/due', tokenB)).body ?? []).some((entry) => entry.pet_id === murka.id),
  }
  summary.checks.ownerARecordsUntouched = JSON.stringify(await events()) === JSON.stringify(before)
}

summary.consoleErrors = consoleErrors

await browser.close()
console.log(JSON.stringify(summary, null, 2))
