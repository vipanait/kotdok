/**
 * MW-05 acceptance run against the local stack: screenshots and checks for
 * docs/verification/medical-record-web-05.md.
 *
 * Needs: the local Supabase stack, the site on http://localhost:3100 started
 * with apps/web/.env.integration (.claude/launch.json «web-local»), freshly
 * seeded demo pets (apps/web/scripts/seed-medical-record-demo.mjs — the run
 * adds, ends, changes and deletes courses of «Мурка»), Playwright and Chrome:
 *
 *   PLAYWRIGHT=/path/to/node_modules/playwright \
 *   CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *   node docs/verification/medical-record-web-05/verify.mjs
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

/** What the phone reads for its medicine screens: GET /pets/{id}/health with a bearer token. */
const courses = async (petId = murka.id) => (await api(`/pets/${petId}/health`, tokenA)).body.medications
const byName = (list, name) => list.filter((course) => course.name === name)
const seeded = await courses()
const food = byName(seeded, 'Лечебный корм')[0]
const fortiflora = byName(seeded, 'Фортифлора')[0]
if (!food?.ongoing || fortiflora?.ended_on !== '2026-08-15' || seeded.length !== 2) throw new Error('The seeded courses are not as expected; seed again')

// The owner's day in the browser's zone (Europe/Moscow below), as the forms count it.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date())
const plusDays = (day, days) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true })
const summary = { site: SITE, today, murka: murka.id, bobik: bobik.id, checks: {} }
const consoleErrors = []

async function signedInPage(email, width = 1440) {
  const context = await browser.newContext({
    viewport: { width, height: width > 760 ? 1000 : 844 },
    deviceScaleFactor: 1,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
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

/** The section as the owner reads it. */
const sectionCards = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      ['courses-current', 'courses-past'].map((id) => [
        id === 'courses-current' ? 'current' : 'past',
        [...document.querySelectorAll(`section[aria-labelledby="${id}"] .course-card`)].map((card) =>
          [...card.children].map((node) => node.textContent.trim()).join(' | '),
        ),
      ]),
    ),
  )

const readCourse = (page) =>
  page.evaluate(() => ({
    url: location.pathname + location.search,
    title: document.querySelector('h1')?.textContent ?? null,
    badge: document.querySelector('.event-badge')?.textContent ?? null,
    facts: [...document.querySelectorAll('.course-facts > div')].map((row) => row.textContent.replace(/\s+/g, ' ').trim()),
    actions: [...document.querySelectorAll('.pagehead a.btn, .event-actions button')].map((node) => node.textContent.trim()),
    actionsBody: document.querySelector('.event-actions p')?.textContent ?? null,
    notice: document.querySelector('.health-saved')?.textContent ?? null,
  }))

const item = (page, n, field) => page.locator(`.course-item >> nth=${n}`).locator(`input[id$="-${field}"]`)

const takingNow = (page) =>
  page.evaluate(() => {
    const row = [...document.querySelectorAll('.health-facts dl > div')].find((div) => div.querySelector('dt')?.textContent === 'Принимает сейчас')
    return row?.querySelector('dd')?.textContent ?? null
  })

const recordCard = (page) =>
  page.evaluate(() => {
    const card = [...document.querySelectorAll('.health-section')].find((section) => section.querySelector('h2')?.textContent === 'Лекарства')
    return card ? [...card.querySelectorAll('.record-line')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()) : null
  })

async function summaryCourses() {
  const body = (await api(`/pets/${murka.id}/health/summary`, tokenA)).body
  return body.medications.map((course) => ({ name: course.name, ended_on: course.ended_on, ongoing: course.ongoing }))
}

async function formMedications(page) {
  await open(page, `/pets/${murka.id}/edit`, 'form')
  return page.$eval('#pet-medications, [id$="medications"]', (node) => node.value).catch(() => null)
}

// ---------- Owner A, desktop ----------
{
  const { context, page } = await signedInPage('owner-a@fixture.local', 1440)
  const posts = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (request.method() === 'POST' && /\/health\/medications$/.test(path)) {
      posts.push({ key: request.headers()['idempotency-key'], body: request.postDataJSON() })
    }
  })

  // ----- The screens as seeded -----
  await open(page, `/pets/${murka.id}/health/medications`, '.courses-page')
  summary.checks.seededSection = { title: text(await page.textContent('h1')), subtitle: text(await page.textContent('.pagehead p')), cards: await sectionCards(page) }
  await shot(page, 'medications-1440')

  await open(page, `/pets/${murka.id}/health/${food.id}`, '.course-record')
  summary.checks.currentCourse = await readCourse(page)
  await shot(page, 'course-1440')

  await open(page, `/pets/${murka.id}/health/${fortiflora.id}`, '.course-record')
  summary.checks.finishedCourse = await readCourse(page)
  await shot(page, 'course-finished-1440')

  // ----- A finished course: its edit address never shows a form; the server refuses the change -----
  await page.goto(`${SITE}/pets/${murka.id}/health/${fortiflora.id}/edit`)
  await page.waitForSelector('.course-record, .health-problem')
  summary.checks.finishedEdit = {
    finalUrl: new URL(page.url()).pathname,
    form: !!(await page.$('form.course-form')),
    patch: await api(`/pets/${murka.id}/health/medications/${fortiflora.id}`, tokenA, { method: 'PATCH', body: JSON.stringify({ dosage: 'иначе' }) }).then((r) => ({ status: r.status, code: r.body?.error?.code })),
    unchanged: JSON.stringify(byName(await courses(), 'Фортифлора')[0]) === JSON.stringify(fortiflora),
  }

  // ----- The new form: one empty course; «Постоянно» hides the end -----
  await open(page, `/pets/${murka.id}/health/new?type=medication`, 'form.course-form')
  summary.checks.newForm = {
    items: await page.locator('.course-item').count(),
    start: await item(page, 0, 'start').inputValue(),
    name: await item(page, 0, 'name').inputValue(),
    endFields: await item(page, 0, 'end').count(),
  }
  await shot(page, 'medication-new-1440')
  await item(page, 0, 'end').fill(plusDays(today, 3))
  await page.locator('.course-item >> nth=0').locator('input[type=checkbox]').check()
  summary.checks.ongoingHidesEnd = { endFieldsWhileOngoing: await item(page, 0, 'end').count() }
  await page.locator('.course-item >> nth=0').locator('input[type=checkbox]').uncheck()
  summary.checks.ongoingHidesEnd.endKeptAfterUntick = await item(page, 0, 'end').inputValue()

  // ----- MW-05.3: an end before the start is blocked, nothing is sent -----
  await item(page, 0, 'name').fill('Омепразол')
  await item(page, 0, 'dosage').fill('1 капсула утром')
  await item(page, 0, 'end').fill(plusDays(today, -1))
  const postsBefore = posts.length
  await page.click('form.course-form button[type=submit]')
  await page.waitForSelector('.course-item .field-error')
  summary.checks.endBeforeStart = {
    error: text(await page.textContent('.course-item .field-error')),
    focus: await focused(page),
    requests: posts.length - postsBefore,
    endMin: await item(page, 0, 'end').getAttribute('min'),
  }
  await shot(page, 'medication-end-before-start-1440', false)

  // Two courses in one save: one with an end, one «Постоянно».
  await item(page, 0, 'end').fill(plusDays(today, 10))
  await page.click('button.event-add-item')
  await page.waitForTimeout(150)
  summary.checks.addAnotherFocus = await focused(page)
  await item(page, 1, 'name').fill('Пробиотик')
  await page.locator('.course-item >> nth=1').locator('input[type=checkbox]').check()

  // ----- MW-05.3: a failed batch keeps the form and stores nothing -----
  const countBefore = (await courses()).length
  await page.route('**/api/v1/pets/*/health/medications', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'dependency_unavailable', message: 'down', request_id: 'verify' } }) })
      : route.continue(),
  )
  await page.click('form.course-form button[type=submit]')
  await page.waitForSelector('.event-form-banner')
  summary.checks.failed503 = {
    banner: text(await page.textContent('.event-form-banner')),
    items: await page.locator('.course-item').count(),
    names: [await item(page, 0, 'name').inputValue(), await item(page, 1, 'name').inputValue()],
    stillOnForm: page.url().includes('/new'),
    buttonUsable: await page.$eval('form.course-form button[type=submit]', (button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true'),
    serverCourses: (await courses()).length - countBefore,
  }
  await page.unroute('**/api/v1/pets/*/health/medications')

  // ----- MW-05.3: the answer is lost after the server stored the batch; the retry stores nothing twice -----
  await page.route('**/api/v1/pets/*/health/medications', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.fetch()
    await route.abort('internetdisconnected')
  })
  await page.click('form.course-form button[type=submit]')
  await page.waitForFunction(() => document.querySelector('.event-form-banner')?.textContent.includes('Нет связи'))
  summary.checks.lostAnswer = {
    banner: text(await page.textContent('.event-form-banner')),
    stillOnForm: page.url().includes('/new'),
    notice: !!(await page.$('.health-saved')),
    serverCourses: (await courses()).length - countBefore,
  }
  await shot(page, 'medication-error-1440')
  await page.unroute('**/api/v1/pets/*/health/medications')
  const retryFrom = posts.length
  await Promise.all([page.waitForURL(/\/health\/medications\?saved=added/), page.click('form.course-form button[type=submit]')])
  await page.waitForSelector('.courses-page .health-saved')
  await settle(page)
  const afterSave = await courses()
  summary.checks.retry = {
    keys: [...new Set(posts.slice(-3).map((post) => post.key))].length,
    lastBody: posts[posts.length - 1].body,
    retryRequests: posts.length - retryFrom,
    serverCourses: afterSave.length - countBefore,
    omeprazole: byName(afterSave, 'Омепразол').map((c) => ({ dosage: c.dosage, started_on: c.started_on, ended_on: c.ended_on, ongoing: c.ongoing })),
    probiotic: byName(afterSave, 'Пробиотик').map((c) => ({ started_on: c.started_on, ended_on: c.ended_on, ongoing: c.ongoing })),
    notice: text(await page.textContent('.health-saved')),
  }

  // ----- MW-05.1: finite and «Постоянно» differ in the list, the record and the summary -----
  summary.checks.criterion1 = {
    section: await sectionCards(page),
    subtitle: text(await page.textContent('.pagehead p')),
  }
  await shot(page, 'medications-after-save-1440')
  await open(page, `/pets/${murka.id}`, '.health-grid')
  summary.checks.criterion1.recordCard = await recordCard(page)
  summary.checks.criterion1.takingNow = await takingNow(page)
  summary.checks.criterion1.summary = await summaryCourses()
  summary.checks.criterion1.petForm = await formMedications(page)
  await open(page, `/pets/${murka.id}`, '.health-grid')
  await shot(page, 'medical-after-save-1440')

  // ----- «Постоянно» sends no end; three presses make one request -----
  await open(page, `/pets/${murka.id}/health/new?type=medication`, 'form.course-form')
  await item(page, 0, 'name').fill('Витамины')
  await page.route('**/api/v1/pets/*/health/medications', async (route) => {
    if (route.request().method() === 'POST') await new Promise((done) => setTimeout(done, 1500))
    await route.continue()
  })
  const pressFrom = posts.length
  const button = page.locator('form.course-form button[type=submit]')
  await button.click()
  await button.click({ force: true })
  await button.click({ force: true })
  await page.waitForURL(/\/health\/medications\?saved=added/)
  await page.unroute('**/api/v1/pets/*/health/medications')
  summary.checks.pending = { requests: posts.length - pressFrom, vitamins: byName(await courses(), 'Витамины').length }

  // ----- MW-05.2: «Завершить курс» on the ongoing «Пробиотик» -----
  const probiotic = byName(await courses(), 'Пробиотик')[0]
  await open(page, `/pets/${murka.id}/health/${probiotic.id}`, '.course-record')
  const endButton = page.locator('.event-actions button', { hasText: 'Завершить курс' })
  await endButton.click()
  await page.waitForSelector('.modal')
  const dialog = {
    title: text(await page.textContent('.modal h2')),
    body: text(await page.textContent('.modal p')),
    initialFocus: await focused(page),
  }
  await page.keyboard.press('Escape')
  dialog.afterEscape = { open: !!(await page.$('.modal')), focus: await focused(page) }
  await endButton.click()
  await page.click('.modal button:text-is("Не завершать")')
  dialog.afterKeep = { open: !!(await page.$('.modal')), focus: await focused(page), stillCurrent: (await courses()).find((c) => c.id === probiotic.id).ended_on === null }
  await endButton.click()
  await shot(page, 'course-end-dialog-1440', false)
  await page.click('.modal button:text-is("Завершить курс")')
  await page.waitForFunction(() => document.querySelector('.event-badge')?.textContent === 'Завершён')
  await settle(page)
  const ended = (await courses()).find((c) => c.id === probiotic.id)
  summary.checks.criterion2 = {
    dialog,
    after: await readCourse(page),
    focus: await focused(page),
    stored: { ended_on: ended.ended_on, ongoing: ended.ongoing },
  }
  await shot(page, 'course-ended-1440')
  await open(page, `/pets/${murka.id}/health/medications`, '.courses-page')
  summary.checks.criterion2.section = await sectionCards(page)
  await open(page, `/pets/${murka.id}`, '.health-grid')
  summary.checks.criterion2.takingNow = await takingNow(page)
  summary.checks.criterion2.summary = await summaryCourses()
  summary.checks.criterion2.petForm = await formMedications(page)
  // Ended today by the owner's day: no form at its edit address either (redirect, or the notice).
  await page.goto(`${SITE}/pets/${murka.id}/health/${probiotic.id}/edit`)
  await page.waitForSelector('.course-record, .health-problem')
  summary.checks.criterion2.editAddress = {
    finalUrl: new URL(page.url()).pathname,
    form: !!(await page.$('form.course-form')),
    shown: text(await page.textContent('h1')),
  }

  // ----- Correcting a current course -----
  await open(page, `/pets/${murka.id}/health/${food.id}/edit`, 'form.course-form')
  await shot(page, 'course-edit-1440')
  await item(page, 0, 'dosage').fill('По схеме врача, 60 г в день')
  await Promise.all([page.waitForURL(/\?saved=changed/), page.click('form.course-form button[type=submit]')])
  await page.waitForSelector('.health-saved')
  const changed = (await courses()).find((c) => c.id === food.id)
  summary.checks.edit = { view: await readCourse(page), stored: { id: changed.id, dosage: changed.dosage, ongoing: changed.ongoing, started_on: changed.started_on } }

  // ----- Leaving a changed form asks first -----
  await open(page, `/pets/${murka.id}/health/new?type=medication`, 'form.course-form')
  await item(page, 0, 'name').fill('Черновик')
  await page.click('form.course-form .form-actions a.link')
  await page.waitForSelector('.modal')
  const leave = { title: text(await page.textContent('.modal h2')) }
  await page.click('.modal button:text-is("Остаться")')
  leave.focus = await focused(page)
  leave.kept = await item(page, 0, 'name').inputValue()
  summary.checks.leaveGuard = leave

  // Up to ten courses in one save.
  for (let n = 1; n < 10; n += 1) await page.click('button.event-add-item')
  summary.checks.tenItems = {
    items: await page.locator('.course-item').count(),
    addButton: await page.locator('button.event-add-item').count(),
    note: text(await page.textContent('.course-form > p.field-hint')),
  }
  // Removing one: focus goes to the next course's name, not to the page.
  await page.locator('.course-item >> nth=3').locator('.event-item-remove').click()
  await page.waitForTimeout(150)
  summary.checks.tenItems.afterRemove = { items: await page.locator('.course-item').count(), focus: await page.evaluate(() => document.activeElement?.id?.endsWith('-name') ?? false) }
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')))

  // ----- Deleting a course asks, naming it -----
  const vitamins = byName(await courses(), 'Витамины')[0]
  await open(page, `/pets/${murka.id}/health/${vitamins.id}`, '.course-record')
  await page.click('.event-actions button:text-is("Удалить курс")')
  await page.waitForSelector('.modal')
  const del = { title: text(await page.textContent('.modal h2')), initialFocus: await focused(page) }
  await Promise.all([page.waitForURL(/\?saved=deleted/), page.click('.modal button:text-is("Удалить")')])
  await page.waitForSelector('.health-saved')
  del.notice = text(await page.textContent('.health-saved'))
  del.gone = byName(await courses(), 'Витамины').length === 0
  summary.checks.delete = del

  // ----- MW-05.4: a reload and the phone's endpoint show the same courses -----
  await open(page, `/pets/${murka.id}/health/medications`, '.courses-page')
  const before = await sectionCards(page)
  await page.reload()
  await page.waitForSelector('.courses-page .event-list')
  await settle(page)
  const after = await sectionCards(page)
  const phone = await courses()
  const phoneCurrent = phone.filter((c) => c.ended_on === null || c.ended_on > today).map((c) => c.name).sort()
  const phonePast = phone.filter((c) => !(c.ended_on === null || c.ended_on > today)).map((c) => c.name).sort()
  summary.checks.criterion4 = {
    sameAfterReload: JSON.stringify(before) === JSON.stringify(after),
    page: after,
    phoneCurrent,
    phonePast,
    pageMatchesPhone:
      JSON.stringify(after.current.map((line) => line.split(' | ')[0]).sort()) === JSON.stringify(phoneCurrent) &&
      JSON.stringify(after.past.map((line) => line.split(' | ')[0]).sort()) === JSON.stringify(phonePast),
  }
  await shot(page, 'medications-final-1440')

  await context.close()
}

// ---------- Phone width ----------
{
  const { context, page } = await signedInPage('owner-a@fixture.local', 390)
  const list = await courses()
  const current = list.find((c) => c.name === 'Лечебный корм')
  const finished = list.find((c) => c.name === 'Фортифлора')
  summary.checks.overflow390 = {}
  await open(page, `/pets/${murka.id}/health/medications`, '.courses-page')
  summary.checks.overflow390.section = await overflow(page)
  summary.checks.order390 = await page.evaluate(() => {
    const list = document.querySelector('.courses-page .event-list')?.getBoundingClientRect().top
    const aside = document.querySelector('.courses-page .section-aside')?.getBoundingClientRect().top
    return { coursesFirst: list < aside }
  })
  await phoneFullShot(page, 'medications-390-full')
  await shot(page, 'medications-390', false)
  await open(page, `/pets/${bobik.id}/health/medications`, '.courses-page')
  summary.checks.overflow390.empty = await overflow(page)
  summary.checks.empty = { title: text(await page.textContent('.events-empty h2')), subtitle: text(await page.textContent('.pagehead p')) }
  await phoneFullShot(page, 'medications-empty-390-full')
  await open(page, `/pets/${murka.id}/health/${current.id}`, '.course-record')
  summary.checks.overflow390.course = await overflow(page)
  summary.checks.tap390 = await page.$$eval('.event-actions button, .pagehead a.btn', (nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height)))
  await phoneFullShot(page, 'course-390-full')
  await open(page, `/pets/${murka.id}/health/${finished.id}`, '.course-record')
  summary.checks.overflow390.finished = await overflow(page)
  await phoneFullShot(page, 'course-finished-390-full')
  await open(page, `/pets/${murka.id}/health/new?type=medication`, 'form.course-form')
  await page.click('button.event-add-item')
  await item(page, 1, 'name').fill('Очень длинное название препарата, которое не должно выходить за пределы экрана телефона')
  summary.checks.overflow390.newForm = await overflow(page)
  await phoneFullShot(page, 'medication-new-390-full')
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')))
  await open(page, `/pets/${murka.id}/health/${current.id}/edit`, 'form.course-form')
  summary.checks.overflow390.edit = await overflow(page)
  await phoneFullShot(page, 'course-edit-390-full')
  await open(page, `/pets/${murka.id}`, '.health-grid')
  await phoneFullShot(page, 'medical-390-full')
  await context.close()
}

// ---------- Other widths ----------
{
  const list = await courses()
  const current = list.find((c) => c.name === 'Лечебный корм')
  summary.checks.overflowByWidth = {}
  for (const width of [1150, 1024, 900, 768, 760, 360, 320]) {
    const { context, page } = await signedInPage('owner-a@fixture.local', width)
    await open(page, `/pets/${murka.id}/health/medications`, '.courses-page')
    summary.checks.overflowByWidth[`section ${width}`] = await overflow(page)
    await open(page, `/pets/${murka.id}/health/${current.id}`, '.course-record')
    summary.checks.overflowByWidth[`course ${width}`] = await overflow(page)
    await open(page, `/pets/${murka.id}/health/new?type=medication`, 'form.course-form')
    summary.checks.overflowByWidth[`form ${width}`] = await overflow(page)
    await context.close()
  }
}

// ---------- Owner B: someone else's courses ----------
{
  const before = await courses()
  const course = before.find((c) => c.name === 'Лечебный корм')
  const { context, page } = await signedInPage('owner-b@fixture.local', 1440)
  const requests = []
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/')) requests.push(request.url())
  })
  summary.checks.foreignPages = {}
  for (const path of [
    `/pets/${murka.id}/health/medications`,
    `/pets/${murka.id}/health/${course.id}`,
    `/pets/${murka.id}/health/${course.id}/edit`,
    `/pets/${murka.id}/health/new?type=medication`,
  ]) {
    const response = await page.goto(`${SITE}${path}`)
    await page.waitForLoadState('networkidle')
    const html = await page.content()
    summary.checks.foreignPages[path] = {
      status: response.status(),
      h1: text(await page.textContent('h1').catch(() => '')),
      shown: !!(await page.$('.courses-page, .course-form, .course-record')),
      leaks: ['Лечебный корм', 'Фортифлора', 'Омепразол', 'Мурка · '].filter((word) => html.includes(word)),
    }
  }
  summary.checks.foreignApiRequests = requests
  await shot(page, 'foreign-course-1440')
  await context.close()

  summary.checks.foreignApi = {
    read: (await api(`/pets/${murka.id}/health`, tokenB)).status,
    add: (await api(`/pets/${murka.id}/health/medications`, tokenB, { method: 'POST', body: JSON.stringify({ items: [{ name: 'x', started_on: today }] }), headers: { 'Idempotency-Key': crypto.randomUUID() } })).status,
    end: (await api(`/pets/${murka.id}/health/medications/${course.id}`, tokenB, { method: 'PATCH', body: JSON.stringify({ ended_on: today, ongoing: false }) })).status,
    delete: (await api(`/pets/${murka.id}/health/medications/${course.id}`, tokenB, { method: 'DELETE' })).status,
  }
  summary.checks.ownerACoursesUntouched = JSON.stringify(await courses()) === JSON.stringify(before)
}

summary.consoleErrors = consoleErrors

await browser.close()
console.log(JSON.stringify(summary, null, 2))
