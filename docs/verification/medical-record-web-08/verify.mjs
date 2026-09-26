/**
 * MW-08 acceptance run against the local stack (integration and final
 * acceptance of the web medical record): the overview's due lines with five
 * pets, the pet form's notes, widths 320–1440 without horizontal scrolling,
 * sticky actions, save errors that keep the form, a slow answer, the lost
 * answer and its retry, keyboard and accessible names, two owners, HTTP 404
 * of someone else's pet, no push / notification permission / service worker,
 * and a regression pass over the existing pages.
 *
 * Needs: the local Supabase stack, the site on http://localhost:3100 started
 * with apps/web/.env.integration (.claude/launch.json «web-local»), freshly
 * seeded demo pets (apps/web/scripts/seed-medical-record-demo.mjs), Playwright
 * and Chrome:
 *
 *   PLAYWRIGHT=/path/to/node_modules/playwright \
 *   CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *   node docs/verification/medical-record-web-08/verify.mjs > docs/verification/medical-record-web-08/verify-output.json
 *
 * Writes PNGs next to this file and prints a JSON summary. It writes to the
 * local database only through the site, as the owner would: one course
 * («Проверка MW-08», deleted again at the end) and the pet form of «Бобик»
 * saved unchanged. Local only: it refuses any origin or database that is not
 * localhost.
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
    headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
  return { status: response.status, body: await response.json().catch(() => null) }
}

const tokenA = await token('owner-a@fixture.local')
const tokenB = await token('owner-b@fixture.local')
const DEMO_NOTE = 'Демо медкарты (seed-medical-record-demo)'
const petsA = (await api('/pets', tokenA)).body
const demo = petsA.filter((pet) => pet.notes === DEMO_NOTE)
const murka = demo.find((pet) => pet.name === 'Мурка')
const bobik = demo.find((pet) => pet.name === 'Бобик')
const baron = demo.find((pet) => pet.name.startsWith('Барон'))
if (!murka || !bobik || !baron) throw new Error('Seed the demo pets first (apps/web/scripts/seed-medical-record-demo.mjs)')

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date())
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

/** The line each pet should get, worked out here from `/pets/due` alone (spec §7.1). */
function expectedDue(due) {
  const earliest = {}
  for (const entry of due) if (!earliest[entry.pet_id] || entry.date < earliest[entry.pet_id].date) earliest[entry.pet_id] = entry
  return Object.fromEntries(Object.entries(earliest).filter(([, entry]) => daysBetween(today, entry.date) <= 14))
}

const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true })
const result = { site: SITE, today, pets: { count: petsA.length, murka: murka.id, bobik: bobik.id, baron: baron.id }, checks: {} }
const consoleErrors = []

/** Records every call that would ask for notifications or register a worker, per document. */
const PUSH_PROBE = () => {
  window.__pushCalls = []
  const note = (name) => window.__pushCalls.push(name)
  if (window.Notification) {
    const ask = Notification.requestPermission.bind(Notification)
    Notification.requestPermission = (...args) => (note('Notification.requestPermission'), ask(...args))
  }
  if (navigator.serviceWorker) {
    const register = navigator.serviceWorker.register.bind(navigator.serviceWorker)
    navigator.serviceWorker.register = (...args) => (note('serviceWorker.register'), register(...args))
  }
  if (window.PushManager) {
    const subscribe = PushManager.prototype.subscribe
    PushManager.prototype.subscribe = function (...args) {
      note('PushManager.subscribe')
      return subscribe.apply(this, args)
    }
  }
}

async function signedInPage(email, width = 1440) {
  const context = await browser.newContext({
    viewport: { width, height: width > 760 ? 1000 : 844 },
    deviceScaleFactor: 1,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
  })
  await context.addInitScript(PUSH_PROBE)
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`${email} ${width} ${new URL(page.url()).pathname}: ${message.text()}`)
  })
  await page.goto(`${SITE}/login`)
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', password)
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login')), page.press('input[type=password]', 'Enter')])
  return { context, page }
}

const text = (value) => (value ?? '').replace(/\s+/g, ' ').trim()
const shot = (page, name, fullPage = true) => page.screenshot({ path: resolve(here, `${name}.png`), fullPage })
async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(250)
}
async function open(page, path, selector = 'main') {
  await page.goto(`${SITE}${path}`)
  await page.waitForSelector(selector, { timeout: 60_000 })
  await settle(page)
}
const pushCalls = []
async function probePush(page) {
  const calls = await page.evaluate(() => window.__pushCalls ?? []).catch(() => [])
  if (calls.length) pushCalls.push({ path: new URL(page.url()).pathname, calls })
}

/** The rows of a pet list: name, due line, where the row leads. */
const petRows = (page, scope) =>
  page.$$eval(`${scope} .compact-pet`, (links) =>
    links.map((link) => ({
      name: link.querySelector('h3')?.textContent ?? '',
      due: link.querySelector('.compact-pet-due')?.textContent ?? null,
      tone: link.querySelector('.compact-pet-due')?.className.replace('compact-pet-due', '').trim() ?? null,
      dueOneLine: (() => {
        const due = link.querySelector('.compact-pet-due')
        if (!due) return null
        const style = getComputedStyle(due)
        return style.whiteSpace === 'nowrap' && style.textOverflow === 'ellipsis' && due.getBoundingClientRect().height < 24
      })(),
      href: link.getAttribute('href'),
      accessibleName: link.textContent.replace(/\s+/g, ' ').trim(),
    })),
  )

try {
  const due = (await api('/pets/due', tokenA)).body
  const expected = expectedDue(due)
  result.checks.dueApi = {
    total: due.length,
    expectedLines: Object.fromEntries(Object.entries(expected).map(([petId, entry]) => [petsA.find((pet) => pet.id === petId)?.name, { date: entry.date, kind: entry.kind }])),
  }

  // ----- MW-08.1: five pets, a compact overview, «Все питомцы», due lines that lead to their pet -----
  {
    const { context, page } = await signedInPage('owner-a@fixture.local', 1440)
    const dueRequests = []
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname
      if (path.startsWith('/api/v1/pets')) dueRequests.push(`${request.method()} ${path}`)
    })
    await open(page, '/dashboard', '.pets-summary')
    await probePush(page)
    const rows = await petRows(page, '.pets-summary')
    const card = await page.$eval('.pets-summary', (element) => Math.round(element.getBoundingClientRect().height))
    const allLink = await page.$eval('.pets-summary .list-footer a', (a) => ({ text: a.textContent.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href') }))
    await shot(page, 'dashboard-1440')

    // Each drawn line is the pet's own nearest date; a pet shown without a line has none.
    const wrong = []
    for (const row of rows) {
      const petId = row.href.split('/').pop()
      if (Boolean(row.due) !== Boolean(expected[petId])) wrong.push(row.name)
    }
    const overviewRequests = [...dueRequests]
    // The first row with a line opens that pet's record.
    const withLine = rows.find((row) => row.due)
    let opened = null
    if (withLine) {
      await Promise.all([page.waitForURL((url) => url.pathname === withLine.href), page.click(`.pets-summary a.compact-pet[href="${withLine.href}"]`)])
      await page.waitForSelector('.health-head h1', { timeout: 60_000 })
      opened = { path: new URL(page.url()).pathname, heading: text(await page.textContent('.health-head h1')) }
    }

    await open(page, '/dashboard', '.pets-summary')
    await Promise.all([page.waitForURL((url) => url.pathname === '/pets'), page.click('.pets-summary .list-footer a')])
    await page.waitForSelector('.pet-directory')
    const all = await petRows(page, '.pet-directory')
    await shot(page, 'pets-1440')
    const wrongAll = all.filter((row) => Boolean(row.due) !== Boolean(expected[row.href.split('/').pop()])).map((row) => row.name)

    result.checks.criterion1 = {
      pets: petsA.length,
      overviewRows: rows.length,
      overviewCardHeight: card,
      allLink,
      rows,
      wrongLines: wrong,
      firstLineOpens: opened,
      listRows: all.length,
      listRowsWithLine: all.filter((row) => row.due).map((row) => ({ name: row.name, due: row.due, tone: row.tone, oneLine: row.dueOneLine })),
      wrongListLines: wrongAll,
      // The overview reads its lines on the server, from one list of plans: no request per pet from the browser.
      browserApiRequestsOnOverview: overviewRequests,
    }
    await context.close()
  }

  // Phone widths of the overview and the list.
  for (const width of [390, 320]) {
    const { context, page } = await signedInPage('owner-a@fixture.local', width)
    await open(page, '/dashboard', '.pets-summary')
    await shot(page, `dashboard-${width}`)
    await open(page, '/pets', '.pet-directory')
    await shot(page, `pets-${width}`)
    result.checks[`lines${width}`] = (await petRows(page, '.pet-directory')).filter((row) => row.due).map((row) => ({ due: row.due, oneLine: row.dueOneLine }))
    await context.close()
  }

  // ----- The pet form: notes where the record says more (spec §4), none for «Бобик» -----
  {
    const { context, page } = await signedInPage('owner-a@fixture.local', 1440)
    await open(page, `/pets/${murka.id}/edit`, 'form.pet-form')
    const hints = () =>
      page.$$eval('form.pet-form .field', (fields) =>
        fields
          .filter((field) => field.querySelector('.field-hint'))
          .map((field) => {
            const hint = field.querySelector('.field-hint')
            const control = field.querySelector('input, select')
            return { label: field.querySelector('label')?.textContent, hint: hint.textContent, describedBy: control?.getAttribute('aria-describedby') === hint.id }
          }),
      )
    const murkaHints = await hints()
    await shot(page, 'pet-edit-murka-1440')
    await open(page, `/pets/${bobik.id}/edit`, 'form.pet-form')
    const bobikHints = await hints()
    await shot(page, 'pet-edit-bobik-1440')

    // Saved unchanged: the body carries the owner's day and the form as opened; the weight history does not grow.
    const weightsBefore = (await api(`/pets/${bobik.id}/health`, tokenA)).body.weights.length
    const bodies = []
    page.on('request', (request) => {
      if (request.method() === 'PUT' && new URL(request.url()).pathname === `/api/pets/${bobik.id}`) bodies.push(request.postDataJSON())
    })
    await Promise.all([page.waitForURL((url) => url.pathname === '/pets'), page.click('form.pet-form button[type=submit]')])
    const weightsAfter = (await api(`/pets/${bobik.id}/health`, tokenA)).body.weights.length
    result.checks.petForm = {
      murkaHints,
      bobikHints,
      savedUnchanged: {
        weight_measured_on: bodies[0]?.weight_measured_on,
        weight_kg_before: bodies[0]?.weight_kg_before,
        medications_before: bodies[0]?.medications_before,
        weightsBefore,
        weightsAfter,
      },
    }
    await context.close()
  }
  {
    const { context, page } = await signedInPage('owner-a@fixture.local', 390)
    await open(page, `/pets/${murka.id}/edit`, 'form.pet-form')
    await shot(page, 'pet-edit-murka-390')
    await context.close()
  }

  // ----- MW-08.3: no horizontal scroll at 320–1440; sticky actions cover neither the last fields nor the bottom navigation -----
  const PAGES = [
    ['dashboard', '/dashboard', '.pets-summary'],
    ['pets', '/pets', '.pet-directory'],
    ['pet-new', '/pets/new', 'form.pet-form'],
    ['record', `/pets/${murka.id}`, '.health-head'],
    ['record-baron', `/pets/${baron.id}`, '.health-head'],
    ['record-bobik', `/pets/${bobik.id}`, '.health-head'],
    ['pet-edit', `/pets/${murka.id}/edit`, 'form.pet-form'],
    ['due', `/pets/${murka.id}/health/due`, 'main h1'],
    ['vaccinations', `/pets/${murka.id}/health/vaccinations`, 'main h1'],
    ['parasites', `/pets/${murka.id}/health/parasites`, 'main h1'],
    ['weight', `/pets/${murka.id}/health/weight`, 'main h1'],
    ['medications', `/pets/${murka.id}/health/medications`, 'main h1'],
    ['visits', `/pets/${murka.id}/health/visits`, 'main h1'],
    ['add', `/pets/${murka.id}/health/new`, 'main h1'],
    ['new-vaccination', `/pets/${murka.id}/health/new?type=vaccination`, 'main form'],
    ['new-medication', `/pets/${murka.id}/health/new?type=medication`, 'form.course-form'],
    ['new-visit', `/pets/${murka.id}/health/new?type=visit`, 'main form'],
    ['new-weight', `/pets/${murka.id}/health/new?type=weight`, 'main form'],
    ['vet-summary', `/pets/${baron.id}/vet-summary`, '.vet-summary'],
    ['checks', '/checks', 'main h1'],
    ['check', '/check', 'main'],
    ['credits', '/credits', 'main h1'],
  ]
  const layout = {}
  for (const width of [320, 390, 768, 1024, 1440]) {
    const { context, page } = await signedInPage('owner-a@fixture.local', width)
    for (const [name, path, selector] of PAGES) {
      await open(page, path, selector)
      await probePush(page)
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await page.waitForTimeout(150)
      const measured = await page.evaluate(() => {
        const overflow = document.documentElement.scrollWidth - window.innerWidth
        const visible = (element) => {
          const style = getComputedStyle(element)
          const rect = element.getBoundingClientRect()
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
        }
        // What is pinned to the bottom of the screen: the phone navigation and the record's actions.
        const pinned = [...document.querySelectorAll('body *')].filter((element) => {
          if (!visible(element)) return false
          const style = getComputedStyle(element)
          if (style.position !== 'fixed' && style.position !== 'sticky') return false
          const rect = element.getBoundingClientRect()
          return rect.bottom >= window.innerHeight - 2 || element.classList.contains('health-actions')
        })
        const pinnedTop = Math.min(...pinned.filter((element) => !element.closest('.sidebar')).map((element) => element.getBoundingClientRect().top), window.innerHeight)
        const main = document.querySelector('main')
        // The last controls and text of the page itself, outside anything pinned.
        const content = [...(main?.querySelectorAll('input, select, textarea, button, a, p, h2, h3, li, .card') ?? [])].filter(
          (element) => visible(element) && !pinned.some((pin) => pin.contains(element)),
        )
        const lastBottom = Math.max(...content.map((element) => element.getBoundingClientRect().bottom), 0)
        const actions = document.querySelector('.health-actions')
        const nav = document.querySelector('.mobile-nav')
        const actionsOverNav =
          actions && nav && visible(actions) && visible(nav) && getComputedStyle(actions).position === 'fixed'
            ? Math.round(actions.getBoundingClientRect().bottom - nav.getBoundingClientRect().top)
            : null
        return {
          overflow,
          pinned: pinned.map((element) => element.className || element.tagName).slice(0, 4),
          coveredBy: Math.max(0, Math.round(lastBottom - pinnedTop)),
          actionsOverNav,
        }
      })
      layout[`${name}@${width}`] = measured
      if (width === 320 && ['record', 'new-medication', 'pet-edit', 'vet-summary'].includes(name)) await shot(page, `${name}-320`)
    }
    if (width === 390) {
      await open(page, `/pets/${murka.id}`, '.health-head')
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await page.waitForTimeout(200)
      await shot(page, 'record-390-bottom', false)
    }
    await context.close()
  }
  const problems = Object.entries(layout).filter(([, value]) => value.overflow > 0 || value.coveredBy > 0 || (value.actionsOverNav ?? 0) > 0)
  result.checks.criterion3 = { measured: Object.keys(layout).length, problems, sample: { 'record@390': layout['record@390'], 'new-medication@390': layout['new-medication@390'] } }

  // ----- MW-08.4: save errors keep what was typed; a slow answer shows it is pending; the lost answer's retry saves once -----
  {
    const { context, page } = await signedInPage('owner-a@fixture.local', 390)
    const posts = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/health\/medications$/.test(new URL(request.url()).pathname)) {
        posts.push({ key: request.headers()['idempotency-key'] })
      }
    })
    const courses = async () => (await api(`/pets/${murka.id}/health`, tokenA)).body.medications
    const name = 'Проверка MW-08'
    const countBefore = (await courses()).length
    await open(page, `/pets/${murka.id}/health/new?type=medication`, 'form.course-form')
    const field = (id) => page.locator('.course-item >> nth=0').locator(`input[id$="-${id}"]`)
    await field('name').fill(name)
    await field('dosage').fill('1 таблетка вечером')

    // Offline: the browser has no connection at all.
    await context.setOffline(true)
    await page.click('form.course-form button[type=submit]')
    await page.waitForSelector('.event-form-banner')
    const offline = {
      banner: text(await page.textContent('.event-form-banner')),
      name: await field('name').inputValue(),
      dosage: await field('dosage').inputValue(),
      stillOnForm: page.url().includes('/new'),
      buttonUsable: await page.$eval('form.course-form button[type=submit]', (button) => !button.disabled),
    }
    await shot(page, 'save-offline-390', false)
    await context.setOffline(false)

    // Slow: the answer takes three seconds; a second tap sends nothing more.
    await page.route('**/api/v1/pets/*/health/medications', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      await new Promise((done) => setTimeout(done, 3000))
      await route.fetch()
      // …and then the answer is lost after the server stored the course.
      await route.abort('internetdisconnected')
    })
    const sentBefore = posts.length
    await page.click('form.course-form button[type=submit]')
    await page.waitForTimeout(500)
    const pending = {
      ariaBusy: await page.$eval('form.course-form', (form) => form.getAttribute('aria-busy')),
      button: text(await page.textContent('form.course-form button[type=submit]')),
    }
    await page.click('form.course-form button[type=submit]', { force: true }).catch(() => {})
    await page.waitForFunction(() => document.querySelector('.event-form-banner')?.textContent.includes('Нет связи'), null, { timeout: 20_000 })
    pending.requestsForTwoTaps = posts.length - sentBefore
    const lost = { banner: text(await page.textContent('.event-form-banner')), name: await field('name').inputValue(), stored: (await courses()).length - countBefore }
    await page.unroute('**/api/v1/pets/*/health/medications')

    // The retry: the same key, and the course is stored once.
    await Promise.all([page.waitForURL(/\/health\/medications\?saved=added/), page.click('form.course-form button[type=submit]')])
    await settle(page)
    const after = await courses()
    const stored = after.filter((course) => course.name === name)
    result.checks.criterion4 = {
      offline,
      pending,
      lost,
      retry: { keys: [...new Set(posts.map((post) => post.key))].length, requests: posts.length, storedOnce: stored.length === 1 },
    }
    // Leave the demo record as it was.
    for (const course of stored) await api(`/pets/${murka.id}/health/medications/${course.id}`, tokenA, { method: 'DELETE' })

    // The pet form: a failed save keeps every field.
    await open(page, `/pets/${bobik.id}/edit`, 'form.pet-form')
    await page.fill('form.pet-form input[id$="-allergies"]', 'Курица, рыба')
    await page.route(`**/api/pets/${bobik.id}`, (route) => (route.request().method() === 'PUT' ? route.abort('internetdisconnected') : route.continue()))
    await page.click('form.pet-form button[type=submit]')
    await page.waitForSelector('form.pet-form .form-error')
    result.checks.criterion4.petForm = {
      error: text(await page.textContent('form.pet-form .form-error')),
      allergies: await page.inputValue('form.pet-form input[id$="-allergies"]'),
      stillOnForm: page.url().endsWith('/edit'),
    }
    await shot(page, 'pet-form-error-390', false)
    await page.unroute(`**/api/pets/${bobik.id}`)
    await context.close()
  }

  // ----- The record's own read with no connection: an error with «Повторить», never an empty record; it works once back -----
  {
    const { context, page } = await signedInPage('owner-a@fixture.local', 390)
    await page.route('**/api/v1/pets/*/health', (route) => route.abort('internetdisconnected'))
    await page.goto(`${SITE}/pets/${murka.id}`)
    await page.waitForSelector('.health-problem', { timeout: 60_000 })
    const problem = text(await page.textContent('.health-problem'))
    const emptyRecordShown = !!(await page.$('.health-grid'))
    await shot(page, 'record-offline-390', false)
    await page.unroute('**/api/v1/pets/*/health')
    await page.click('.health-problem button')
    await page.waitForSelector('.health-grid', { timeout: 60_000 })
    result.checks.recordOffline = { problem, emptyRecordShown, afterRetry: !!(await page.$('.health-grid')) }
    await context.close()
  }

  // ----- Keyboard and accessible names on the overview -----
  {
    const { context, page } = await signedInPage('owner-a@fixture.local', 1440)
    await open(page, '/dashboard', '.pets-summary')
    const stops = []
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press('Tab')
      stops.push(
        await page.evaluate(() => {
          const element = document.activeElement
          const style = getComputedStyle(element)
          return {
            outside: element === document.body || element.tagName === 'NEXTJS-PORTAL',
            text: (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
            href: element.getAttribute('href'),
            focusVisible: style.outlineStyle !== 'none' || style.boxShadow !== 'none',
          }
        }),
      )
    }
    // Past the page's last control the focus goes to the browser (the body) and, in `next dev`, to its overlay portal.
    const pageStops = stops.filter((stop) => !stop.outside)
    const petStops = pageStops.filter((stop) => stop.href?.startsWith('/pets/') && stop.href !== '/pets/new')
    result.checks.keyboard = {
      petRowStops: petStops,
      pageStops: pageStops.length,
      allFocusVisible: pageStops.every((stop) => stop.focusVisible),
      withoutVisibleFocus: pageStops.filter((stop) => !stop.focusVisible),
      overdueLinkByName: await page.getByRole('link', { name: /просрочено/ }).count(),
    }
    await context.close()
  }

  // ----- MW-08.5: two owners; someone else's pet is an HTTP 404 on every page of it -----
  {
    const { context, page } = await signedInPage('owner-b@fixture.local', 1440)
    await open(page, '/dashboard', 'main h1')
    const bRows = await petRows(page, 'main')
    const record = (await api(`/pets/${murka.id}/health`, tokenA)).body
    const markers = [DEMO_NOTE, ...new Set(record.events.flatMap((event) => [event.clinic, event.diagnosis, event.reason]).filter((value) => value && value.length > 6))]
    const statuses = {}
    for (const path of ['', '/edit', '/vet-summary', '/health/due', '/health/vaccinations', '/health/new?type=vaccination']) {
      const response = await context.request.get(`${SITE}/pets/${murka.id}${path}`, { maxRedirects: 0 })
      const html = await response.text()
      // «Мурка» itself is in every page's dictionary (a placeholder of the pet form): A's own data is looked for instead.
      statuses[path || '/'] = { status: response.status(), leaksData: markers.filter((marker) => html.includes(marker)) }
    }
    await open(page, `/pets/${murka.id}`, 'main')
    await shot(page, 'foreign-pet-1440')
    result.checks.criterion5 = {
      ownerBRows: bRows.map((row) => row.name),
      ownerBSeesA: bRows.some((row) => petsA.some((pet) => row.href?.endsWith(pet.id))),
      foreignPages: statuses,
      malformedId: (await context.request.get(`${SITE}/pets/not-a-pet`, { maxRedirects: 0 })).status(),
      api: {
        bReadsARecord: (await api(`/pets/${murka.id}/health`, tokenB)).status,
        bReadsASummary: (await api(`/pets/${murka.id}/health/summary`, tokenB)).status,
        bPatchesAPet: (await api(`/pets/${murka.id}`, tokenB, { method: 'PATCH', body: JSON.stringify({ name: 'x' }) })).status,
        noToken: (await api('/pets/due')).status,
        bDueHasA: ((await api('/pets/due', tokenB)).body ?? []).some((entry) => petsA.some((pet) => pet.id === entry.pet_id)),
      },
    }
    await context.close()
  }
  {
    // Signed out: sign-in first, back to the exact page after.
    const context = await browser.newContext()
    const response = await context.request.get(`${SITE}/pets/${murka.id}/vet-summary`, { maxRedirects: 0 })
    result.checks.criterion5.signedOut = { status: response.status(), location: response.headers().location }
    await context.close()
  }

  // ----- The summary's file title does not stay on the next page -----
  {
    const { context, page } = await signedInPage('owner-a@fixture.local', 1440)
    await open(page, `/pets/${murka.id}/vet-summary`, '.vet-summary')
    await page.waitForFunction(() => document.title.includes('медкарта'))
    const onSummary = await page.title()
    await page.click('.sidebar a[href="/pets"]')
    await page.waitForURL((url) => url.pathname === '/pets')
    await page.waitForTimeout(800)
    result.checks.fileTitle = { onSummary, afterLeaving: await page.title() }
    await context.close()
  }

  result.checks.push = {
    calls: pushCalls,
    note: 'Notification.requestPermission, serviceWorker.register and PushManager.subscribe wrapped on every page of the run',
  }
  {
    const { context, page } = await signedInPage('owner-a@fixture.local', 1440)
    await open(page, `/pets/${murka.id}`, '.health-head')
    result.checks.push.afterRun = await page.evaluate(async () => ({
      notificationPermission: window.Notification?.permission ?? 'unsupported',
      serviceWorkers: navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 'unsupported',
    }))
    await context.close()
  }
} finally {
  result.consoleErrors = consoleErrors
  await browser.close()
}

console.log(JSON.stringify(result, null, 2))
