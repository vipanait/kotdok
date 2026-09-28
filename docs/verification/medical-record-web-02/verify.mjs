/**
 * MW-02 acceptance run against the local stack: screenshots and checks for
 * docs/verification/medical-record-web-02.md.
 *
 * Needs: the local Supabase stack, the site on http://localhost:3100 started
 * with apps/web/.env.integration (.claude/launch.json «web-local»), freshly
 * seeded demo pets (apps/web/scripts/seed-medical-record-demo.mjs — the run
 * adds, changes and deletes weights), Playwright and Chrome:
 *
 *   PLAYWRIGHT=/path/to/node_modules/playwright \
 *   CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *   node docs/verification/medical-record-web-02/verify.mjs
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
    headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...(init.body ? { 'content-type': 'application/json' } : {}) },
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

// The owner's day in the browser's zone (Europe/Moscow below), as the form counts it.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date())
const tomorrow = new Date(`${today}T12:00:00Z`)
tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
const tomorrowDay = tomorrow.toISOString().slice(0, 10)

const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true })
const summary = { site: SITE, today, murka: murka.id, bobik: bobik.id, checks: {} }
const consoleErrors = []

async function signedInPage(email, width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: width > 760 ? 1000 : 844 }, deviceScaleFactor: 1, locale: 'ru-RU', timezoneId: 'Europe/Moscow' })
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

const weightHref = (id) => `/pets/${id}/health/weight`
const text = (value) => (value ?? '').replace(/\s+/g, ' ').trim()

async function settle(page) {
  await page.evaluate(() => document.fonts.ready)
}

async function openWeight(page, id) {
  await page.goto(`${SITE}${weightHref(id)}`)
  await page.waitForSelector('.weight-page, .health-problem', { timeout: 60_000 })
  await settle(page)
}

async function openRecord(page, id) {
  await page.goto(`${SITE}/pets/${id}`)
  await page.waitForSelector('.health-page, .health-problem', { timeout: 60_000 })
  await settle(page)
}

async function readWeightPage(page) {
  return page.evaluate(() => ({
    current: document.querySelector('.weight-summary h2')?.textContent?.trim() ?? null,
    note: [...document.querySelectorAll('.weight-summary > p')].map((p) => p.textContent.trim()),
    chartPoints: document.querySelectorAll('.weight-summary .weight-chart circle').length,
    chartLabel: document.querySelector('.weight-summary .weight-chart')?.getAttribute('aria-label') ?? null,
    period: document.querySelector('.weight-periods [aria-pressed="true"]')?.textContent?.trim() ?? null,
    rows: [...document.querySelectorAll('.record-table tbody tr')].map((row) => row.textContent.replace(/\s+/g, ' ').trim()),
  }))
}

async function readHead(page) {
  return text(await page.textContent('.health-weight'))
}

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
    return el ? `${el.tagName.toLowerCase()} ${(el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60)}` : null
  })

async function submitAndWait(page) {
  await Promise.all([page.waitForURL(/\/health\/weight\?saved=|\/health\/weight$/), page.click('.weight-form button[type=submit]')])
  await page.waitForSelector('.weight-page')
  await settle(page)
}

// ---------- Owner A, desktop: the whole weight flow ----------
{
  const { context, page } = await signedInPage('owner-a@fixture.local', 1440)

  // The record: weight card links to the section, «Добавить запись» opens the chooser.
  await openRecord(page, murka.id)
  summary.checks.recordEntryPoints = await page.evaluate((id) => ({
    weightAll: !!document.querySelector(`.health-card-head a[href="/pets/${id}/health/weight"]`),
    addRecord: !!document.querySelector(`a[href="/pets/${id}/health/new"]`),
    otherSections: document.querySelectorAll('.health-card-head a').length,
  }), murka.id)
  summary.checks.headBefore = await readHead(page)
  await shot(page, 'record-1440')

  await page.click(`a[href="/pets/${murka.id}/health/new"]`)
  await page.waitForSelector('.record-chooser')
  summary.checks.chooser = await page.$$eval('.record-chooser a', (links) => links.map((link) => `${link.textContent.trim()} → ${link.getAttribute('href')}`))
  await shot(page, 'add-1440')

  // Section: periods filter the chart.
  await openWeight(page, murka.id)
  summary.checks.weightHalfYear = await readWeightPage(page)
  await shot(page, 'weight-1440')
  await page.click('.weight-periods button:text-is("Год")')
  summary.checks.weightYear = await readWeightPage(page)
  await page.click('.weight-periods button:text-is("Всё")')
  summary.checks.weightAll = await readWeightPage(page)
  await page.click('.weight-periods button:text-is("Полгода")')

  // 3: validation by the contract, before anything is sent.
  const posts = []
  page.on('request', (request) => {
    if (request.url().includes('/health/weights') && request.method() !== 'GET') posts.push({ method: request.method(), url: request.url(), body: request.postData() })
  })
  await page.click('a:has-text("Добавить вес")')
  await page.waitForSelector('.weight-form')
  await settle(page)
  summary.checks.newFormDefaults = await page.evaluate(() => ({
    weight: document.querySelector('.weight-form input[inputmode=decimal]').value,
    day: document.querySelector('.weight-form input[type=date]').value,
    max: document.querySelector('.weight-form input[type=date]').max,
  }))
  await shot(page, 'weight-new-1440')
  summary.checks.validation = {}
  for (const [weight, day] of [['', today], ['0', today], ['-1', today], ['200,1', today], ['4,25', today], ['абв', today], ['4,2', tomorrowDay], ['4,2', '']]) {
    await page.fill('.weight-form input[inputmode=decimal]', weight)
    await page.fill('.weight-form input[type=date]', day)
    await page.click('.weight-form button[type=submit]')
    await page.waitForTimeout(150)
    summary.checks.validation[`«${weight}» ${day || '(no date)'}`] = await page.$$eval('.weight-form .field-error', (errors) => errors.map((e) => e.textContent.trim()))
    if (weight === '4,2' && day === tomorrowDay) await shot(page, 'weight-new-errors-1440')
  }
  summary.checks.requestsAfterInvalid = posts.length

  // The same values straight to the API: the server refuses them too.
  summary.checks.apiRefuses = {}
  for (const body of [{ measured_on: today, weight_kg: 0 }, { measured_on: today, weight_kg: -1 }, { measured_on: today, weight_kg: 200.1 }, { measured_on: '2099-01-01', weight_kg: 4.2 }, { measured_on: today }]) {
    summary.checks.apiRefuses[JSON.stringify(body)] = (await api(`/pets/${murka.id}/health/weights`, tokenA, { method: 'POST', body: JSON.stringify(body) })).status
  }

  // Leaving a changed form asks first; staying keeps the value and focus returns to the link.
  await page.fill('.weight-form input[inputmode=decimal]', '4,2')
  await page.fill('.weight-form input[type=date]', today)
  await page.click('.weight-form .form-actions a')
  await page.waitForSelector('.modal')
  summary.checks.leaveDialog = { title: text(await page.textContent('.modal h2')), focus: await focused(page) }
  await shot(page, 'weight-leave-1440')
  await page.click('.modal button:has-text("Остаться")')
  summary.checks.leaveStay = {
    url: page.url().replace(SITE, ''),
    value: await page.inputValue('.weight-form input[inputmode=decimal]'),
    focus: await focused(page),
  }

  // A save that cannot reach the server: an error, the fields kept, the button usable again.
  await page.route('**/api/v1/pets/*/health/weights', (route) => route.abort('internetdisconnected'))
  await page.click('.weight-form button[type=submit]')
  await page.waitForSelector('.record-form-error')
  summary.checks.saveOffline = {
    banner: text(await page.textContent('.record-form-error')),
    weight: await page.inputValue('.weight-form input[inputmode=decimal]'),
    day: await page.inputValue('.weight-form input[type=date]'),
    button: text(await page.textContent('.weight-form button[type=submit]')),
    buttonDisabled: await page.$eval('.weight-form button[type=submit]', (b) => b.disabled || b.getAttribute('aria-disabled') === 'true'),
  }
  await shot(page, 'weight-save-error-1440')
  await page.unroute('**/api/v1/pets/*/health/weights')

  // Pending: the answer held back; «Сохраняем…», and a second press sends nothing more.
  let release
  const held = new Promise((done) => (release = done))
  await page.route('**/api/v1/pets/*/health/weights', async (route) => {
    await held
    await route.continue()
  })
  const before = posts.length
  await page.click('.weight-form button[type=submit]')
  await page.waitForSelector('.weight-form[aria-busy=true]')
  // aria-disabled, not disabled: the button keeps focus and still takes the click, which does nothing.
  await page.click('.weight-form button[type=submit]', { force: true })
  await page.click('.weight-form button[type=submit]', { force: true })
  summary.checks.pending = {
    button: text(await page.textContent('.weight-form button[type=submit]')),
    ariaBusy: await page.getAttribute('.weight-form', 'aria-busy'),
    readOnly: await page.$eval('.weight-form input[inputmode=decimal]', (input) => input.readOnly),
  }
  await shot(page, 'weight-pending-1440')
  release()
  await page.waitForURL(/\/health\/weight/)
  await page.waitForSelector('.weight-page')
  await settle(page)
  await page.unroute('**/api/v1/pets/*/health/weights')
  // The offline attempt, then one request for three presses.
  summary.checks.requestsForOneSave = posts.length - before
  summary.checks.sentBody = posts[posts.length - 1]?.body ?? null

  // 1: after the save — the confirmation, the row, then the same after a reload.
  summary.checks.afterAdd = { notice: text(await page.textContent('.health-saved')), focus: await focused(page), url: page.url().replace(SITE, ''), page: await readWeightPage(page) }
  await shot(page, 'weight-added-1440')
  await page.reload()
  await page.waitForSelector('.weight-page')
  await settle(page)
  summary.checks.afterAddReload = { notice: !!(await page.$('.health-saved')), page: await readWeightPage(page) }
  await openRecord(page, murka.id)
  summary.checks.headAfterAdd = await readHead(page)

  // 2: correct the latest measurement.
  await openWeight(page, murka.id)
  await page.click('.record-table tbody tr:first-child a')
  await page.waitForSelector('.weight-form')
  await settle(page)
  summary.checks.editForm = {
    url: page.url().replace(SITE, ''),
    title: text(await page.textContent('h1')),
    weight: await page.inputValue('.weight-form input[inputmode=decimal]'),
    day: await page.inputValue('.weight-form input[type=date]'),
  }
  await shot(page, 'weight-edit-1440')
  await page.fill('.weight-form input[inputmode=decimal]', '4,6')
  await submitAndWait(page)
  summary.checks.afterEdit = { notice: text(await page.textContent('.health-saved')), page: await readWeightPage(page) }
  await openRecord(page, murka.id)
  summary.checks.headAfterEdit = await readHead(page)
  summary.checks.recordChartAfterEdit = await page.$eval('.health-section .weight-chart', (svg) => svg.getAttribute('aria-label'))
  await page.goto(`${SITE}/pets/${murka.id}/edit`)
  await page.waitForSelector('form')
  // The pet form's weight field (its id ends in «-weight»).
  summary.checks.petFormAfterEdit = await page.$eval('input[id$="-weight"]', (input) => input.value)

  // Moving a measurement onto a day that has one: said at the date field.
  await openWeight(page, murka.id)
  await page.click('.record-table tbody tr:first-child a')
  await page.waitForSelector('.weight-form')
  const takenDay = (await api(`/pets/${murka.id}/health`, tokenA)).body.weights[1].measured_on
  await page.fill('.weight-form input[type=date]', takenDay)
  await page.click('.weight-form button[type=submit]')
  await page.waitForSelector('.weight-form .field-error')
  summary.checks.dayTaken = { error: text(await page.textContent('.weight-form .field-error')), stayed: page.url().includes('/edit') }
  await page.fill('.weight-form input[type=date]', today)

  // 2: delete it — the question names it, cancel is focused, Escape returns focus to the trigger.
  await page.click('.record-form-delete')
  await page.waitForSelector('.modal')
  summary.checks.deleteDialog = { title: text(await page.textContent('.modal h2')), body: text(await page.textContent('.modal p')), focus: await focused(page) }
  await shot(page, 'weight-delete-1440')
  await page.keyboard.press('Escape')
  await page.waitForSelector('.modal', { state: 'detached' })
  summary.checks.deleteEscapeFocus = await focused(page)
  await page.click('.record-form-delete')
  await page.waitForSelector('.modal')
  await Promise.all([page.waitForURL(/saved=deleted|\/health\/weight$/), page.click('.modal button:has-text("Удалить")')])
  await page.waitForSelector('.weight-page')
  await settle(page)
  summary.checks.afterDelete = { notice: text(await page.textContent('.health-saved')), page: await readWeightPage(page) }
  await openRecord(page, murka.id)
  summary.checks.headAfterDelete = await readHead(page)
  summary.checks.recordChartAfterDelete = await page.$eval('.health-section .weight-chart', (svg) => svg.getAttribute('aria-label'))

  // The record address of a measurement opens its form; an unknown one and a closed type are 404.
  const firstWeight = (await api(`/pets/${murka.id}/health`, tokenA)).body.weights[0]
  await page.goto(`${SITE}/pets/${murka.id}/health/${firstWeight.id}`)
  await page.waitForSelector('.weight-form, h1')
  summary.checks.recordRoute = page.url().replace(SITE, '')
  summary.checks.notFoundRoutes = {}
  for (const path of [`/pets/${murka.id}/health/00000000-0000-4000-8000-000000000000/edit`, `/pets/${murka.id}/health/weights`, `/pets/${murka.id}/health/new?type=vaccination`, `/pets/${murka.id}/health/new?type=nope`]) {
    await page.goto(`${SITE}${path}`)
    await page.waitForLoadState('networkidle')
    summary.checks.notFoundRoutes[path] = { h1: text(await page.textContent('h1').catch(() => '')), form: !!(await page.$('.weight-form')) }
  }

  // 4: Бобик — only the form's weight; «Уточнить» adds a dated one, a period without measurements.
  await openWeight(page, bobik.id)
  summary.checks.bobikBefore = await readWeightPage(page)
  await shot(page, 'weight-one-1440')
  await page.click('.record-table a:has-text("Уточнить")')
  await page.waitForSelector('.weight-form')
  await page.fill('.weight-form input[inputmode=decimal]', '27,5')
  await page.fill('.weight-form input[type=date]', '2025-01-10')
  await submitAndWait(page)
  summary.checks.bobikHalfYear = await readWeightPage(page)
  await shot(page, 'weight-empty-period-1440')
  await page.click('.weight-periods button:text-is("Всё")')
  summary.checks.bobikAll = await readWeightPage(page)
  // The form's old undated value is now a row of its own: «Уточнить» opens it with an empty date.
  await page.click('.record-table tbody tr:last-child a')
  await page.waitForSelector('.weight-form')
  summary.checks.bobikUndatedForm = {
    weight: await page.inputValue('.weight-form input[inputmode=decimal]'),
    day: await page.inputValue('.weight-form input[type=date]'),
    hint: text(await page.textContent('.weight-form .field-hint')),
  }
  await context.close()
}

// ---------- Owner A, phone ----------
{
  const { context, page } = await signedInPage('owner-a@fixture.local', 390)
  await openWeight(page, murka.id)
  summary.checks.overflow390 = { weight: await overflow(page) }
  await shot(page, 'weight-390', false)
  await phoneFullShot(page, 'weight-390-full')
  await openWeight(page, bobik.id)
  summary.checks.overflow390.bobik = await overflow(page)
  await phoneFullShot(page, 'weight-one-390-full')
  await page.goto(`${SITE}/pets/${murka.id}/health/new?type=weight`)
  await page.waitForSelector('.weight-form')
  await settle(page)
  summary.checks.overflow390.newForm = await overflow(page)
  await shot(page, 'weight-new-390', false)
  await openWeight(page, murka.id)
  await page.click('.record-table tbody tr:first-child a')
  await page.waitForSelector('.weight-form')
  await settle(page)
  summary.checks.overflow390.editForm = await overflow(page)
  await shot(page, 'weight-edit-390', false)
  await page.click('.record-form-delete')
  await page.waitForSelector('.modal')
  await shot(page, 'weight-delete-390', false)
  await page.keyboard.press('Escape')
  await page.goto(`${SITE}/pets/${murka.id}/health/new`)
  await page.waitForSelector('.record-chooser')
  summary.checks.overflow390.chooser = await overflow(page)
  await shot(page, 'add-390', false)
  await context.close()
}

// ---------- Other widths ----------
{
  const { context, page } = await signedInPage('owner-a@fixture.local', 1440)
  summary.checks.overflowByWidth = {}
  for (const width of [1150, 1024, 900, 768, 760, 360, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await openWeight(page, murka.id)
    summary.checks.overflowByWidth[`weight ${width}`] = await overflow(page)
    await page.goto(`${SITE}/pets/${murka.id}/health/new?type=weight`)
    await page.waitForSelector('.weight-form')
    summary.checks.overflowByWidth[`form ${width}`] = await overflow(page)
  }
  await context.close()
}

// ---------- Owner B: someone else's weights ----------
{
  const murkaWeights = (await api(`/pets/${murka.id}/health`, tokenA)).body.weights
  const target = murkaWeights[0]
  const { context, page } = await signedInPage('owner-b@fixture.local', 1440)
  const requests = []
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/')) requests.push(request.url())
  })
  summary.checks.foreignPages = {}
  for (const path of [`/pets/${murka.id}/health/weight`, `/pets/${murka.id}/health/new?type=weight`, `/pets/${murka.id}/health/${target.id}`, `/pets/${murka.id}/health/${target.id}/edit`]) {
    const response = await page.goto(`${SITE}${path}`)
    await page.waitForLoadState('networkidle')
    const html = await page.content()
    summary.checks.foreignPages[path] = {
      status: response.status(),
      h1: text(await page.textContent('h1').catch(() => '')),
      weightShown: !!(await page.$('.weight-page, .weight-form')),
      leaks: ['4,5 кг', '4,4 кг', 'Мурка · Измерения'].filter((word) => html.includes(word)),
    }
  }
  summary.checks.foreignApiRequests = requests
  await shot(page, 'foreign-weight-1440')
  await context.close()

  summary.checks.foreignApi = {
    read: (await api(`/pets/${murka.id}/health`, tokenB)).status,
    add: (await api(`/pets/${murka.id}/health/weights`, tokenB, { method: 'POST', body: JSON.stringify({ measured_on: today, weight_kg: 9 }) })).status,
    change: (await api(`/pets/${murka.id}/health/weights/${target.id}`, tokenB, { method: 'PATCH', body: JSON.stringify({ weight_kg: 9 }) })).status,
    delete: (await api(`/pets/${murka.id}/health/weights/${target.id}`, tokenB, { method: 'DELETE' })).status,
  }
  summary.checks.ownerAWeightsUntouched = JSON.stringify((await api(`/pets/${murka.id}/health`, tokenA)).body.weights) === JSON.stringify(murkaWeights)
}

summary.consoleErrors = consoleErrors

await browser.close()
console.log(JSON.stringify(summary, null, 2))
