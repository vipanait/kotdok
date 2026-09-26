/**
 * MW-06 acceptance run against the local stack: screenshots and checks for
 * docs/verification/medical-record-web-06.md.
 *
 * Needs: the local Supabase stack, the site on http://localhost:3100 started
 * with apps/web/.env.integration (.claude/launch.json «web-local»), freshly
 * seeded demo pets (apps/web/scripts/seed-medical-record-demo.mjs — the run
 * adds visits, marks the seeded plan held, adds two checks of «Мурка»),
 * Playwright and Chrome:
 *
 *   PLAYWRIGHT=/path/to/node_modules/playwright \
 *   CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *   node docs/verification/medical-record-web-06/verify.mjs
 *
 * Writes PNGs next to this file and prints a JSON summary. Local only: it
 * refuses any origin or database that is not localhost.
 */

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../..')
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT ?? 'playwright')
const pg = require(resolve(root, 'node_modules/pg'))

const SITE = process.env.SITE ?? 'http://localhost:3100'
if (!['localhost', '127.0.0.1'].includes(new URL(SITE).hostname)) throw new Error('Local site only')

const env = Object.fromEntries(
  readFileSync(resolve(root, 'apps/web/.env.integration'), 'utf8')
    .split('\n')
    .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]),
)
if (!['127.0.0.1', 'localhost'].includes(new URL(env.TEST_DATABASE_URL.replace(/^postgresql:/, 'http:')).hostname)) throw new Error('Local database only')
const password = /FIXTURE_PASSWORD = '([^']+)'/.exec(readFileSync(resolve(root, 'apps/web/tests/integration/fixtures.ts'), 'utf8'))[1]

async function token(email) {
  const response = await fetch(`${env.TEST_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.TEST_SUPABASE_ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await response.json()
  return { token: body.access_token, userId: body.user?.id }
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

const ownerA = await token('owner-a@fixture.local')
const ownerB = await token('owner-b@fixture.local')
const tokenA = ownerA.token
const tokenB = ownerB.token
const pets = (await api('/pets', tokenA)).body
const DEMO_NOTE = 'Демо медкарты (seed-medical-record-demo)'
const murka = pets.find((pet) => pet.name === 'Мурка' && pet.notes === DEMO_NOTE)
const bobik = pets.find((pet) => pet.name === 'Бобик' && pet.notes === DEMO_NOTE)
if (!murka || !bobik) throw new Error('Seed the demo pets first (apps/web/scripts/seed-medical-record-demo.mjs)')

const record = async (petId = murka.id, bearer = tokenA) => (await api(`/pets/${petId}/health`, bearer)).body
const visits = async () => (await record()).events.filter((event) => event.kind === 'visit')
const courses = async () => (await record()).medications
const named = (list, name) => list.filter((entry) => entry.name === name)
const seededVisits = await visits()
const heldSeed = seededVisits.find((visit) => visit.status === 'done')
const planSeed = seededVisits.find((visit) => visit.status === 'planned')
if (seededVisits.length !== 2 || !heldSeed?.check_id || planSeed?.date !== '2026-10-03') throw new Error('The seeded visits are not as expected; seed again')
const CHECK = heldSeed.check_id

// The owner's day in the browser's zone (Europe/Moscow below), as the forms count it.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date())
const plusDays = (day, days) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

// Two more checks of «Мурка», as the analysis would have saved them: a recent one (the visit
// form offers it) and a healthy one (its result offers no visit).
const db = new pg.Client({ connectionString: env.TEST_DATABASE_URL })
await db.connect()
const insertCheck = async (symptoms, urgency, created) =>
  (
    await db.query(
      `insert into public.symptom_checks
         (user_id, pet_id, symptoms_input, urgency, urgency_reason, possible_causes, species_specific_warning,
          home_care_steps, vet_questions, full_response, created_at, locale)
       values ($1, $2, $3, $4, 'Проверка для MW-06', array[]::text[], null, array[]::text[], array[]::text[], '{}'::jsonb, $5, 'ru')
       returning id`,
      [ownerA.userId, murka.id, symptoms, urgency, created],
    )
  ).rows[0].id
const RECENT = await insertCheck('Хромает на левую лапу\nс утра', 'urgent', `${plusDays(today, -3)}T07:00:00Z`)
const HEALTHY = await insertCheck('Плановый вопрос о питании', 'healthy', `${plusDays(today, -1)}T07:00:00Z`)
const { rows: [foreignCheck] } = await db.query(`select id from public.symptom_checks where user_id = $1 and deleted_at is null limit 1`, [ownerB.userId])
await db.end()

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

const readVisitPage = (page) =>
  page.evaluate(() => ({
    url: location.pathname + location.search,
    badge: document.querySelector('.event-badge')?.textContent ?? null,
    day: document.querySelector('#visit-record-day')?.textContent ?? null,
    facts: [...document.querySelectorAll('.visit-facts > div')].map((row) => row.textContent.replace(/\s+/g, ' ').trim()),
    prescriptions: [...document.querySelectorAll('.visit-prescriptions li')].map((row) => row.textContent.replace(/\s+/g, ' ').trim()),
    check: document.querySelector('.visit-check-link')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
    checkHref: document.querySelector('.visit-check-link')?.getAttribute('href') ?? null,
    actions: [...document.querySelectorAll('.pagehead a.btn, .event-actions button')].map((node) => node.textContent.trim()),
    actionsBody: document.querySelector('.event-actions p')?.textContent ?? null,
    notice: document.querySelector('.health-saved')?.textContent ?? null,
  }))

const readForm = (page) =>
  page.evaluate(() => {
    const form = document.querySelector('form.visit-form')
    const value = (suffix) => form.querySelector(`[id$="${suffix}"]`)?.value ?? null
    const select = form.querySelector('select[id$="-check"]')
    return {
      title: document.querySelector('h1')?.textContent ?? null,
      back: document.querySelector('.pagehead a.link')?.getAttribute('href') ?? null,
      segment: [...form.querySelectorAll('.event-status button')].map((b) => `${b.textContent}${b.getAttribute('aria-pressed') === 'true' ? '*' : ''}`),
      kind: value('-kind'),
      date: value('-date'),
      dateMax: form.querySelector('[id$="-date"]')?.getAttribute('max') ?? null,
      clinic: value('-clinic'),
      reason: value('-reason'),
      diagnosis: value('-diagnosis'),
      notes: value('-notes'),
      prescriptions: form.querySelectorAll('.visit-prescription').length,
      checkBanner: form.querySelector('.visit-form-check')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
      checkChoices: select ? [...select.options].map((o) => `${o.value ? 'check' : 'none'}: ${o.textContent}`) : null,
      checkValue: select?.value ?? null,
      warning: form.querySelector('.visit-form-warning')?.textContent ?? null,
      submit: form.querySelector('button[type=submit]')?.textContent ?? null,
    }
  })

/** The form's rhythm around «Назначения» (handoff «Формы визита и назначений»). */
const spacing = (page) =>
  page.evaluate(() => {
    const r = (el) => el.getBoundingClientRect()
    const form = document.querySelector('form.visit-form')
    const diagnosis = form.querySelector('[id$="-diagnosis"]').closest('.field')
    const section = form.querySelector('.visit-prescriptions-form')
    const heading = section.querySelector('h2')
    const cards = [...section.querySelectorAll('.visit-prescription')]
    const actions = form.querySelector('.form-actions')
    const next = section.nextElementSibling
    return {
      diagnosisToHeading: Math.round(r(heading).top - r(diagnosis).bottom),
      headingToFirstCard: cards[0] ? Math.round(r(cards[0]).top - r(heading).bottom) : null,
      betweenCards: cards[1] ? Math.round(r(cards[1]).top - r(cards[0]).bottom) : null,
      sectionToNext: Math.round(r(next).top - r(section).bottom),
      nextIs: next.querySelector('label')?.textContent ?? next.className,
      beforeActions: Math.round(r(actions).top - r(actions.previousElementSibling).bottom),
      actionsBorderTop: getComputedStyle(actions).borderTopWidth,
      headingsInSection: section.querySelectorAll('h2, h3').length,
      cardTitles: cards.map((card) => card.querySelector('h3')?.textContent ?? null),
      removeButtons: cards.map((card) => card.querySelectorAll('.event-item-remove').length),
      emptyNewNames: cards.map((card) => card.querySelector('input[id$="-name"]').value),
      ticked: cards.map((card) => card.querySelector('input[type=checkbox]').checked),
    }
  })

const prescription = (page, n, field) => page.locator(`.visit-prescription >> nth=${n}`).locator(`input[id$="-${field}"]`)

// ---------- Owner A, desktop ----------
{
  const { context, page } = await signedInPage('owner-a@fixture.local', 1440)
  const writes = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (['POST', 'PATCH'].includes(request.method()) && /\/health\/(visits|items)/.test(path)) {
      writes.push({ method: request.method(), path, key: request.headers()['idempotency-key'] ?? null, body: request.postDataJSON() })
    }
  })

  // ----- The check result: «Записать визит к врачу» with the real check id -----
  await open(page, `/check/${CHECK}`, '.result-hero')
  summary.checks.result = {
    button: text(await page.textContent('.result-visit').catch(() => null)),
    href: await page.getAttribute('.result-visit', 'href').catch(() => null),
  }
  await shot(page, 'result-1440')
  await open(page, `/check/${HEALTHY}`, '.result-hero')
  summary.checks.result.healthyHasButton = !!(await page.$('.result-visit'))

  // ----- MW-06.1: a visit from the result -----
  await open(page, `/check/${CHECK}`, '.result-visit')
  await Promise.all([page.waitForURL(/\/health\/new\?type=visit&check=/), page.click('.result-visit')])
  await page.waitForSelector('form.visit-form')
  await settle(page)
  summary.checks.fromResultForm = await readForm(page)
  await shot(page, 'visit-from-result-1440')
  await page.fill('[id$="-diagnosis"]', 'Гастрит, ремиссия')
  await Promise.all([page.waitForURL(/saved=added/), page.click('form.visit-form button[type=submit]')])
  await page.waitForSelector('.visit-check-link')
  await settle(page)
  const fromResultId = new URL(page.url()).pathname.split('/').pop()
  summary.checks.fromResultSaved = {
    page: await readVisitPage(page),
    server: (await visits()).find((visit) => visit.id === fromResultId),
  }
  await shot(page, 'visit-from-result-saved-1440')
  await Promise.all([page.waitForURL(new RegExp(`/check/${CHECK}$`)), page.click('.visit-check-link')])
  summary.checks.fromResultSaved.backToCheck = new URL(page.url()).pathname

  // ----- MW-06.1 / 06.2: a visit made directly, with two prescriptions -----
  await open(page, `/pets/${murka.id}/health/new?type=visit`, 'form.visit-form')
  // The pet's checks load beside the form: the recent one is offered, none is chosen.
  await page.waitForSelector('select[id$="-check"]')
  summary.checks.directForm = await readForm(page)
  await shot(page, 'visit-new-1440')
  await page.click('.visit-prescriptions-form button.event-add-item')
  await page.waitForTimeout(150)
  summary.checks.addPrescription = {
    afterOneClick: await page.locator('.visit-prescription').count(),
    focus: await focused(page),
    // Spec §7.11: a new prescription has «Добавить в лекарства» ticked; the owner may untick it.
    tickedByDefault: await page.locator('.visit-prescription >> nth=0').locator('input[type=checkbox]').isChecked(),
  }
  await prescription(page, 0, 'name').fill('Смекта')
  await prescription(page, 0, 'instructions').fill('при поносе')
  await page.locator('.visit-prescription >> nth=0').locator('input[type=checkbox]').uncheck()
  await page.click('.visit-prescriptions-form button.event-add-item')
  await prescription(page, 1, 'name').fill('Энтерофурил')
  await prescription(page, 1, 'instructions').fill('2 капсулы 2 раза в день')
  await page.locator('.visit-prescription >> nth=1').locator('input[type=checkbox]').check()
  // A third, removed by its own ×: only that one goes, focus to «Добавить назначение».
  await page.click('.visit-prescriptions-form button.event-add-item')
  await page.locator('.visit-prescription >> nth=2').locator('.event-item-remove').click()
  await page.waitForTimeout(150)
  summary.checks.removeOwn = {
    left: await page.$$eval('.visit-prescription input[id$="-name"]', (inputs) => inputs.map((input) => input.value)),
    focus: await focused(page),
  }
  await page.fill('[id$="-diagnosis"]', 'Пищевое отравление')
  summary.checks.spacing = await spacing(page)
  await shot(page, 'visit-prescriptions-1440')

  // A nameless prescription is refused where it is typed, nothing is sent.
  await page.click('.visit-prescriptions-form button.event-add-item')
  const writesBefore = writes.length
  await page.click('form.visit-form button[type=submit]')
  await page.waitForSelector('.visit-prescription .field-error')
  summary.checks.namelessPrescription = {
    error: text(await page.textContent('.visit-prescription .field-error')),
    focus: await focused(page),
    requests: writes.length - writesBefore,
  }
  await page.locator('.visit-prescription >> nth=2').locator('.event-item-remove').click()

  // ----- MW-06.3: the answer is lost after the server stored the visit; the retry stores nothing twice -----
  const visitsBefore = (await visits()).length
  await page.route('**/api/v1/pets/*/health/visits', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.fetch()
    await route.abort('internetdisconnected')
  })
  await page.click('form.visit-form button[type=submit]')
  await page.waitForFunction(() => document.querySelector('.event-form-banner')?.textContent.includes('Нет связи'))
  summary.checks.lostAnswer = {
    banner: text(await page.textContent('.event-form-banner')),
    stillOnForm: page.url().includes('/new'),
    serverVisits: (await visits()).length - visitsBefore,
    buttonUsable: await page.$eval('form.visit-form button[type=submit]', (b) => !b.disabled && b.getAttribute('aria-disabled') !== 'true'),
  }
  await shot(page, 'visit-lost-answer-1440', false)
  await page.unroute('**/api/v1/pets/*/health/visits')
  await Promise.all([page.waitForURL(/saved=added/), page.click('form.visit-form button[type=submit]')])
  await page.waitForSelector('.visit-prescriptions')
  await settle(page)
  const directId = new URL(page.url()).pathname.split('/').pop()
  const posts = writes.filter((w) => w.method === 'POST' && w.path.endsWith('/visits'))
  summary.checks.retry = {
    posts: posts.length,
    keys: [...new Set(posts.slice(-2).map((w) => w.key))].length,
    serverVisits: (await visits()).length - visitsBefore,
    body: posts[posts.length - 1].body,
    courses: { enterofuril: named(await courses(), 'Энтерофурил').length, smecta: named(await courses(), 'Смекта').length },
  }

  // ----- MW-06.2: after a reload both prescriptions are there; the chosen one is in the medicines once -----
  await page.reload()
  await page.waitForSelector('.visit-prescriptions')
  await settle(page)
  summary.checks.afterReload = await readVisitPage(page)
  summary.checks.afterReload.server = (await visits()).find((visit) => visit.id === directId)
  await shot(page, 'visit-record-1440')

  // «Добавить в лекарства» on «Смекта», pressed twice: one request, one course.
  const smectaButton = page.locator('.visit-prescriptions li', { hasText: 'Смекта' }).locator('button')
  const medicationPostsBefore = writes.filter((w) => w.path.endsWith('/medication')).length
  await smectaButton.click()
  await smectaButton.click({ force: true }).catch(() => {})
  await page.waitForFunction(() => [...document.querySelectorAll('.visit-prescriptions li')].some((li) => li.textContent.includes('Смекта') && li.textContent.includes('В лекарствах')))
  const smectaItem = (await visits()).find((visit) => visit.id === directId).items.find((item) => item.name === 'Смекта')
  const again = await api(`/pets/${murka.id}/health/items/${smectaItem.id}/medication`, tokenA, { method: 'POST' })
  summary.checks.toMedicines = {
    requests: writes.filter((w) => w.path.endsWith('/medication')).length - medicationPostsBefore,
    notice: text(await page.textContent('.health-saved').catch(() => null)),
    apiAgain: { status: again.status, sameCourse: again.body?.medication_id === smectaItem.medication_id },
    smectaCourses: named(await courses(), 'Смекта').length,
    enterofurilCourses: named(await courses(), 'Энтерофурил').length,
  }

  // ----- The owner rule: a visit that happened is only read -----
  await page.goto(`${SITE}/pets/${murka.id}/health/${directId}/edit`)
  await page.waitForSelector('.visit-record-page, .health-problem')
  const heldEditUrl = new URL(page.url()).pathname
  await page.goto(`${SITE}/pets/${murka.id}/health/${directId}/complete`)
  await page.waitForSelector('.visit-record-page, .health-problem')
  const heldCompleteUrl = new URL(page.url()).pathname
  const heldBefore = JSON.stringify((await visits()).find((visit) => visit.id === directId))
  summary.checks.heldReadOnly = {
    actions: (await readVisitPage(page)).actions,
    editUrl: heldEditUrl,
    completeUrl: heldCompleteUrl,
    forms: !!(await page.$('form.visit-form')),
    patch: await api(`/pets/${murka.id}/health/visits/${directId}`, tokenA, { method: 'PATCH', body: JSON.stringify({ diagnosis: 'иначе' }) }).then((r) => ({ status: r.status, code: r.body?.error?.code })),
    patchSeeded: await api(`/pets/${murka.id}/health/visits/${heldSeed.id}`, tokenA, { method: 'PATCH', body: JSON.stringify({ clinic: 'Другая' }) }).then((r) => ({ status: r.status, code: r.body?.error?.code })),
    unchanged: JSON.stringify((await visits()).find((visit) => visit.id === directId)) === heldBefore,
  }

  // «Принимает сейчас» and the medicines page: the chosen courses, once each.
  await open(page, `/pets/${murka.id}`, '.health-grid')
  summary.checks.takingNow = await page.evaluate(
    () => [...document.querySelectorAll('.health-facts dl > div')].find((div) => div.querySelector('dt')?.textContent === 'Принимает сейчас')?.querySelector('dd')?.textContent ?? null,
  )
  summary.checks.recordVisitsCard = await page.evaluate(() => {
    const card = [...document.querySelectorAll('.health-section')].find((section) => section.querySelector('h2')?.textContent === 'Визиты')
    return card ? { lines: [...card.querySelectorAll('.record-line')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()), all: card.querySelector('.health-card-head a')?.getAttribute('href') } : null
  })
  summary.checks.dueOnRecord = await page.$$eval('.health-due .due-row', (rows) =>
    rows.map((row) => ({ text: row.querySelector('.copy')?.textContent.replace(/\s+/g, ' ').trim(), button: row.querySelector('.due-done')?.textContent ?? null, href: row.querySelector('.due-done')?.getAttribute('href') ?? null })),
  )
  summary.checks.checksAll = await page
    .$eval('.health-card-head:has(#health-checks-title) a', (a) => ({ href: a.getAttribute('href'), label: a.getAttribute('aria-label') }))
    .catch(() => null)
  await open(page, `/pets/${murka.id}/health/medications`, '.courses-page')
  summary.checks.medicinesPage = await page.$$eval('.course-card .event-card-day', (nodes) => nodes.map((node) => node.textContent))

  // ----- MW-06.4: the seeded plan — moved, then marked held -----
  await open(page, `/pets/${murka.id}/health/${planSeed.id}`, '.visit-record-page')
  summary.checks.planView = await readVisitPage(page)
  await shot(page, 'visit-planned-1440')
  await Promise.all([page.waitForURL(/\/edit$/), page.click('.pagehead a.btn.secondary')])
  await page.waitForSelector('form.visit-form')
  await settle(page)
  summary.checks.planEditForm = await readForm(page)
  await page.fill('[id$="-date"]', plusDays(today, 10))
  await page.fill('[id$="-clinic"]', 'Айболит')
  await shot(page, 'visit-plan-edit-1440')
  await Promise.all([page.waitForURL(/saved=changed/), page.click('form.visit-form button[type=submit]')])
  await page.waitForSelector('.visit-record-page .health-saved')
  const movedServer = (await visits()).find((visit) => visit.id === planSeed.id)
  const duePage = async () => {
    await open(page, `/pets/${murka.id}/health/due`, '.due-page')
    return page.$$eval('.due-row', (rows) => rows.map((row) => row.textContent.replace(/\s+/g, ' ').trim()))
  }
  summary.checks.moved = {
    patch: writes.filter((w) => w.method === 'PATCH').pop()?.body,
    server: { id: movedServer.id, date: movedServer.date, status: movedServer.status, clinic: movedServer.clinic },
    due: await duePage(),
  }

  await open(page, `/pets/${murka.id}/health/${planSeed.id}`, '.visit-record-page')
  await Promise.all([page.waitForURL(/\/complete$/), page.click('.pagehead a.btn.primary')])
  await page.waitForSelector('form.visit-form')
  await settle(page)
  summary.checks.heldForm = await readForm(page)
  await shot(page, 'visit-complete-1440')
  await page.fill('[id$="-diagnosis"]', 'Здорова')
  await page.click('.visit-prescriptions-form button.event-add-item')
  await prescription(page, 0, 'name').fill('Витамины для кошек')
  await page.locator('.visit-prescription >> nth=0').locator('input[type=checkbox]').check()
  await page.route('**/api/v1/pets/*/health/visits/*', async (route) => {
    if (route.request().method() === 'PATCH') await new Promise((done) => setTimeout(done, 1500))
    await route.continue()
  })
  const pressFrom = writes.length
  const confirm = page.locator('form.visit-form button[type=submit]')
  await confirm.click()
  await confirm.click({ force: true })
  await confirm.click({ force: true })
  await page.waitForURL(/saved=held/)
  await page.unroute('**/api/v1/pets/*/health/visits/*')
  await page.waitForSelector('.visit-record-page .health-saved')
  await settle(page)
  const heldServer = (await visits()).find((visit) => visit.id === planSeed.id)
  summary.checks.held = {
    requests: writes.length - pressFrom,
    page: await readVisitPage(page),
    server: { status: heldServer.status, date: heldServer.date, diagnosis: heldServer.diagnosis, items: heldServer.items.map((i) => [i.name, !!i.medication_id]) },
    vitaminCourses: named(await courses(), 'Витамины для кошек').length,
    due: await duePage(),
  }
  await open(page, `/pets/${murka.id}/health/${planSeed.id}`, '.visit-record-page')
  await shot(page, 'visit-held-1440')

  // ----- MW-06.4: a new plan, then cancelled with a question naming it -----
  await open(page, `/pets/${murka.id}/health/new?type=visit`, 'form.visit-form')
  await page.click('.event-status button:has-text("Запланировать")')
  summary.checks.newPlanForm = await readForm(page)
  await page.fill('[id$="-date"]', plusDays(today, 4))
  await page.fill('[id$="-reason"]', 'Повторный осмотр')
  await shot(page, 'visit-plan-1440')
  await Promise.all([page.waitForURL(/saved=added/), page.click('form.visit-form button[type=submit]')])
  await page.waitForSelector('.visit-record-page')
  const newPlanId = new URL(page.url()).pathname.split('/').pop()
  summary.checks.newPlanDue = (await duePage()).filter((row) => row.includes('Состоялся'))
  await open(page, `/pets/${murka.id}/health/${newPlanId}`, '.visit-record-page')
  const cancel = page.locator('.event-actions button')
  await cancel.click()
  await page.waitForSelector('[role=dialog], [role=alertdialog]')
  const dialog = await page.evaluate(() => {
    const node = document.querySelector('[role=dialog], [role=alertdialog]')
    return { title: node.querySelector('h2')?.textContent ?? null, body: node.querySelector('p')?.textContent ?? null, focus: document.activeElement?.textContent ?? null }
  })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  dialog.focusAfterEscape = await focused(page)
  await cancel.click()
  await page.waitForSelector('[role=dialog], [role=alertdialog]')
  await shot(page, 'visit-cancel-dialog-1440', false)
  await Promise.all([page.waitForURL(/\/health\/visits\?saved=cancelled/), page.click('[role=dialog] button:has-text("Отменить план"), [role=alertdialog] button:has-text("Отменить план")')])
  await page.waitForSelector('.visits-page .health-saved')
  summary.checks.cancelled = {
    dialog,
    notice: text(await page.textContent('.health-saved')),
    gone: !(await visits()).some((visit) => visit.id === newPlanId),
    due: (await duePage()).filter((row) => row.includes('Состоялся')),
  }

  // ----- The section and the pet's check history -----
  // A plan again, so the section shows both groups (web v1 «visits»).
  const sectionPlan = (
    await api(`/pets/${murka.id}/health/visits`, tokenA, {
      method: 'POST',
      body: JSON.stringify({ status: 'planned', date: plusDays(today, 7), visit_kind: 'checkup', clinic: 'Айболит', reason: 'Контрольный осмотр' }),
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    })
  ).body
  summary.checks.sectionPlan = sectionPlan.id
  await open(page, `/pets/${murka.id}/health/visits`, '.visits-page')
  summary.checks.section = await page.evaluate(() => ({
    subtitle: document.querySelector('.pagehead p')?.textContent ?? null,
    planned: [...document.querySelectorAll('section[aria-labelledby="visits-planned"] .visit-card')].map((card) => card.textContent.replace(/\s+/g, ' ').trim()),
    done: [...document.querySelectorAll('section[aria-labelledby="visits-done"] .visit-card')].map((card) => card.textContent.replace(/\s+/g, ' ').trim()),
  }))
  await shot(page, 'visits-1440')
  await open(page, `/pets/${bobik.id}/health/visits`, '.visits-page')
  summary.checks.empty = { title: text(await page.textContent('.visits-empty h2')), body: text(await page.textContent('.visits-empty p')) }
  await shot(page, 'visits-empty-1440')
  await open(page, `/checks?pet=${murka.id}`, '.pagehead')
  summary.checks.petHistory = {
    subtitle: text(await page.textContent('.pagehead p')),
    back: await page.getAttribute('.pagehead a.link', 'href'),
    rows: await page.$$eval('.history-row', (rows) => rows.map((row) => row.getAttribute('href'))),
  }
  await shot(page, 'pet-history-1440')

  // A check of another owner, or no such check: no form.
  const foreignFrom = await page.goto(`${SITE}/pets/${murka.id}/health/new?type=visit&check=${foreignCheck?.id ?? '00000000-0000-4000-8000-000000000000'}`)
  await page.waitForLoadState('networkidle')
  summary.checks.foreignCheckParam = { status: foreignFrom.status(), form: !!(await page.$('form.visit-form')), h1: text(await page.textContent('h1').catch(() => '')) }

  // A recent check can be picked on a direct visit; the old one stays off the list.
  summary.checks.recentChoice = { recent: RECENT, healthy: HEALTHY }

  await context.close()
}

// ---------- Phone, 390 ----------
{
  const { context, page } = await signedInPage('owner-a@fixture.local', 390)
  // A fresh plan for the «Состоялся» form on the phone.
  const phonePlan = (
    await api(`/pets/${murka.id}/health/visits`, tokenA, {
      method: 'POST',
      body: JSON.stringify({ status: 'planned', date: plusDays(today, 6), visit_kind: 'checkup', clinic: 'Айболит', reason: 'Контрольный осмотр' }),
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    })
  ).body
  const direct = (await visits()).find((visit) => visit.items.some((item) => item.name === 'Энтерофурил'))
  summary.checks.overflow390 = {}
  const phone = async (path, selector, name, prepare) => {
    await open(page, path, selector)
    if (prepare) await prepare()
    summary.checks.overflow390[name] = await overflow(page)
    await phoneFullShot(page, `${name}-390-full`)
  }
  await phone(`/pets/${murka.id}/health/visits`, '.visits-page', 'visits')
  await shot(page, 'visits-390', false)
  await phone(`/pets/${bobik.id}/health/visits`, '.visits-page', 'visits-empty')
  await phone(`/pets/${murka.id}/health/${direct.id}`, '.visit-record-page', 'visit-record')
  await phone(`/pets/${murka.id}/health/${phonePlan.id}`, '.visit-record-page', 'visit-planned')
  summary.checks.tap390 = await page.$$eval('.event-actions button, .pagehead a.btn', (nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height)))
  await phone(`/pets/${murka.id}/health/${phonePlan.id}/complete`, 'form.visit-form', 'visit-complete')
  await phone(`/pets/${murka.id}/health/new?type=visit`, 'form.visit-form', 'visit-prescriptions', async () => {
    await page.click('.visit-prescriptions-form button.event-add-item')
    await prescription(page, 0, 'name').fill('Очень длинное название назначения, которое не должно выходить за пределы экрана')
    await page.click('.visit-prescriptions-form button.event-add-item')
  })
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')))
  await phone(`/pets/${murka.id}/health/new?type=visit&check=${CHECK}`, 'form.visit-form', 'visit-from-result')
  await phone(`/check/${CHECK}`, '.result-visit', 'result')
  await phone(`/checks?pet=${murka.id}`, '.pagehead', 'pet-history')
  await context.close()
  await api(`/pets/${murka.id}/health/events/${phonePlan.id}`, tokenA, { method: 'DELETE' })
}

// ---------- Other widths ----------
{
  const direct = (await visits()).find((visit) => visit.items.some((item) => item.name === 'Энтерофурил'))
  summary.checks.overflowByWidth = {}
  for (const width of [1150, 1024, 900, 768, 760, 360, 320]) {
    const { context, page } = await signedInPage('owner-a@fixture.local', width)
    await open(page, `/pets/${murka.id}/health/visits`, '.visits-page')
    summary.checks.overflowByWidth[`section ${width}`] = await overflow(page)
    await open(page, `/pets/${murka.id}/health/${direct.id}`, '.visit-record-page')
    summary.checks.overflowByWidth[`visit ${width}`] = await overflow(page)
    await open(page, `/pets/${murka.id}/health/new?type=visit&check=${CHECK}`, 'form.visit-form')
    summary.checks.overflowByWidth[`form ${width}`] = await overflow(page)
    await context.close()
  }
}

// ---------- Owner B: someone else's visits ----------
{
  const before = JSON.stringify(await visits())
  const held = (await visits()).find((visit) => visit.status === 'done')
  const { context, page } = await signedInPage('owner-b@fixture.local', 1440)
  const requests = []
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/')) requests.push(request.url())
  })
  summary.checks.foreignPages = {}
  for (const path of [
    `/pets/${murka.id}/health/visits`,
    `/pets/${murka.id}/health/${held.id}`,
    `/pets/${murka.id}/health/${planSeed.id}/edit`,
    `/pets/${murka.id}/health/${planSeed.id}/complete`,
    `/pets/${murka.id}/health/new?type=visit&check=${CHECK}`,
    `/check/${CHECK}`,
    `/checks?pet=${murka.id}`,
  ]) {
    const response = await page.goto(`${SITE}${path}`)
    await page.waitForLoadState('networkidle')
    const html = await page.content()
    summary.checks.foreignPages[path] = {
      status: response.status(),
      h1: text(await page.textContent('h1').catch(() => '')),
      shown: !!(await page.$('.visits-page, .visit-form, .visit-record-page, .result-hero')),
      leaks: ['Энтерофурил', 'Обострение гастрита', 'Рвота два дня', 'Мурка · '].filter((word) => html.includes(word)),
    }
  }
  summary.checks.foreignApiRequests = requests
  await shot(page, 'foreign-visit-1440')
  await context.close()

  const directItem = (await visits()).find((visit) => visit.items.some((item) => item.name === 'Смекта'))?.items.find((item) => item.name === 'Смекта')
  summary.checks.foreignApi = {
    read: (await api(`/pets/${murka.id}/health`, tokenB)).status,
    create: (await api(`/pets/${murka.id}/health/visits`, tokenB, { method: 'POST', body: JSON.stringify({ status: 'done', date: today, visit_kind: 'other' }), headers: { 'Idempotency-Key': crypto.randomUUID() } })).status,
    change: (await api(`/pets/${murka.id}/health/visits/${held.id}`, tokenB, { method: 'PATCH', body: JSON.stringify({ clinic: 'x' }) })).status,
    toMedicines: directItem ? (await api(`/pets/${murka.id}/health/items/${directItem.id}/medication`, tokenB, { method: 'POST' })).status : null,
    delete: (await api(`/pets/${murka.id}/health/events/${held.id}`, tokenB, { method: 'DELETE' })).status,
  }
  summary.checks.ownerAVisitsUntouched = JSON.stringify(await visits()) === before
}

summary.consoleErrors = consoleErrors

await browser.close()
console.log(JSON.stringify(summary, null, 2))
