/**
 * MW-03 acceptance run against the local stack: screenshots and checks for
 * docs/verification/medical-record-web-03.md.
 *
 * Needs: the local Supabase stack, the site on http://localhost:3100 started
 * with apps/web/.env.integration (.claude/launch.json «web-local»), freshly
 * seeded demo pets and draft catalogue (apps/web/scripts/seed-medical-record-demo.mjs
 * — the run adds, moves and deletes records), Playwright and Chrome:
 *
 *   PLAYWRIGHT=/path/to/node_modules/playwright \
 *   CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *   node docs/verification/medical-record-web-03/verify.mjs
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

const events = async (petId = murka.id) => (await api(`/pets/${petId}/health`, tokenA)).body.events
const seededDone = (await events()).find((event) => event.kind === 'vaccination' && event.status === 'done')
const seededPlan = (await events()).find((event) => event.kind === 'vaccination' && event.status === 'planned')

// The owner's day in the browser's zone (Europe/Moscow below), as the form counts it.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date())
const shift = (day, years) => `${Number(day.slice(0, 4)) + years}${day.slice(4)}`

/** Cat-only products of the draft catalogue: a dog must never be offered them. */
const CAT_ONLY = ['Нобивак Tricat Trio', 'Пуревакс RCP', 'Пуревакс RCPCh', 'Пуревакс FeLV', 'Фелоцел CVR', 'Мультифел-4']

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
    return el ? `${el.tagName.toLowerCase()} ${(el.getAttribute('aria-label') || el.labels?.[0]?.textContent || el.getAttribute('placeholder') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60)}` : null
  })

const sectionHref = (id) => `/pets/${id}/health/vaccinations`
const newHref = (id) => `/pets/${id}/health/new?type=vaccination`

async function open(page, path, selector) {
  await page.goto(`${SITE}${path}`)
  await page.waitForSelector(selector, { timeout: 60_000 })
  await settle(page)
}

async function openForm(page, id) {
  await open(page, newHref(id), '.event-form')
}

/** The combobox's state as assistive technology reads it. */
const combobox = (page) =>
  page.evaluate(() => {
    const input = document.querySelector('[role=combobox]')
    const activeId = input.getAttribute('aria-activedescendant')
    return {
      expanded: input.getAttribute('aria-expanded'),
      controls: !!document.getElementById(input.getAttribute('aria-controls')),
      label: document.querySelector(`label[for="${input.id}"]`)?.textContent ?? null,
      active: activeId ? document.getElementById(activeId)?.textContent.trim().replace(/\s+/g, ' ') : null,
      activeSelected: activeId ? document.getElementById(activeId)?.getAttribute('aria-selected') : null,
      status: document.querySelector('.catalog-combobox [role=status]')?.textContent ?? '',
      options: [...document.querySelectorAll('.catalog-list [role=option]')].map((option) => option.querySelector('strong')?.textContent ?? option.textContent.trim()),
      note: [...document.querySelectorAll('.catalog-note, .catalog-error')].map((node) => node.textContent.trim()),
    }
  })

async function waitOptions(page) {
  await page.waitForFunction(() => document.querySelector('.catalog-popup:not(.hidden) .catalog-note, .catalog-popup:not(.hidden) .catalog-error, .catalog-popup:not(.hidden) .catalog-option strong'))
  await page.waitForFunction(() => !document.querySelector('.catalog-popup:not(.hidden) .catalog-note')?.textContent.includes('Ищем'))
}

const items = (page) =>
  page.$$eval('.event-item', (cards) =>
    cards.map((card) => ({
      title: card.querySelector('.event-item-title')?.textContent ?? card.querySelector('input[type=text]')?.value ?? null,
      pressed: [...card.querySelectorAll('.chip[aria-pressed=true]')].map((chip) => chip.textContent),
      next: card.querySelector('.event-item-next input')?.value ?? null,
    })),
  )

const readRecord = (page) =>
  page.evaluate(() => ({
    url: location.pathname + location.search,
    title: document.querySelector('.event-record-page h1')?.textContent ?? null,
    badge: document.querySelector('.event-badge')?.textContent ?? null,
    day: document.querySelector('#event-record-day')?.textContent ?? null,
    items: [...document.querySelectorAll('.event-record-items li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()),
    editLink: !!document.querySelector('a[href$="/edit"]'),
    actions: document.querySelector('.event-actions')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
    form: !!document.querySelector('.event-form'),
    notice: document.querySelector('.health-saved')?.textContent ?? null,
  }))

// ---------- Owner A, desktop ----------
{
  const { context, page } = await signedInPage('owner-a@fixture.local', 1440)
  const posts = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/health\/events$/.test(new URL(request.url()).pathname)) {
      posts.push({ key: request.headers()['idempotency-key'], body: request.postDataJSON() })
    }
  })

  await open(page, `/pets/${murka.id}`, '.health-page')
  summary.checks.recordEntryPoints = await page.evaluate(() => ({
    vaccinationsLink: [...document.querySelectorAll('a')].find((a) => a.getAttribute('href')?.endsWith('/health/vaccinations'))?.getAttribute('aria-label') ?? null,
  }))
  await open(page, `/pets/${murka.id}/health/new`, '.record-chooser')
  summary.checks.chooser = await page.$$eval('.record-chooser a', (links) => links.map((link) => `${link.textContent.trim()} → ${link.getAttribute('href')}`))

  await open(page, sectionHref(murka.id), '.events-page')
  summary.checks.vaccinesPage = await page.evaluate(() => ({
    planned: [...document.querySelectorAll('#events-planned ~ ul .event-card')].map((card) => card.textContent.replace(/\s+/g, ' ').trim()),
    done: [...document.querySelectorAll('#events-done ~ ul .event-card')].map((card) => card.textContent.replace(/\s+/g, ' ').trim()),
    core: [...document.querySelectorAll('.core-vaccines li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()),
  }))
  await shot(page, 'vaccines-1440')

  await open(page, sectionHref(bobik.id), '.events-page')
  summary.checks.vaccinesEmpty = await page.evaluate(() => ({
    empty: document.querySelector('.events-empty')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
    cards: document.querySelectorAll('.event-card').length,
    core: [...document.querySelectorAll('.core-vaccines li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()),
  }))
  await shot(page, 'vaccines-empty-1440')

  // ----- MW-03.5 + MW-03.1: two vaccines chosen by keyboard and mouse, one record -----
  await openForm(page, murka.id)
  summary.checks.formDefaults = await page.evaluate(() => ({
    status: document.querySelector('.event-status [aria-pressed=true]')?.textContent,
    date: document.querySelector('.event-form input[type=date]')?.value,
    items: document.querySelectorAll('.event-item').length,
  }))
  const keyboard = {}
  keyboard.beforeFocus = (await combobox(page)).expanded
  await page.focus('[role=combobox]')
  await waitOptions(page)
  keyboard.onFocus = await combobox(page)
  await shot(page, 'catalog-1440')
  await page.keyboard.type('нобив')
  await page.waitForTimeout(400)
  await waitOptions(page)
  keyboard.searched = await combobox(page)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  keyboard.afterTwoDown = await combobox(page)
  await page.keyboard.press('ArrowUp')
  keyboard.afterUp = await combobox(page)
  await page.keyboard.press('Escape')
  keyboard.afterEscape = { ...(await combobox(page)), focus: await focused(page) }
  await page.keyboard.press('ArrowDown')
  keyboard.reopened = await combobox(page)
  await page.keyboard.press('Enter')
  keyboard.afterEnter = { combobox: await combobox(page), items: await items(page), submittedForm: page.url().includes('saved=') }
  summary.checks.keyboard = keyboard

  await page.fill('[role=combobox]', 'rabies')
  await page.waitForTimeout(400)
  await waitOptions(page)
  await page.click('.catalog-option:has(strong:text-is("Нобивак Rabies"))')
  await page.fill('.event-form input[id$="-clinic"]', 'Айболит')
  summary.checks.twoItems = await items(page)
  summary.checks.suggestedNext = { expected: shift(today, 1), got: (await items(page)).map((item) => item.next) }
  // The suggestion is only a suggestion: the owner clears the second one.
  await page.click('.event-item:nth-of-type(2) .event-next-clear')
  summary.checks.afterClear = await items(page)
  await page.click('body', { position: { x: 5, y: 5 } })
  await shot(page, 'vaccine-done-1440')

  // ----- MW-03.4: the answer is lost, the save is retried with the same key -----
  await page.route('**/api/v1/pets/*/health/events', async (route) => {
    // The server does save it; the page never hears back.
    await route.fetch()
    await route.abort('internetdisconnected')
  })
  await page.click('.event-form button[type=submit]')
  await page.waitForSelector('.event-form-banner')
  summary.checks.lostAnswer = {
    banner: text(await page.textContent('.event-form-banner')),
    focus: await focused(page),
    itemsKept: await items(page),
    clinicKept: await page.inputValue('.event-form input[id$="-clinic"]'),
    buttonUsable: await page.$eval('.event-form button[type=submit]', (button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true'),
    savedOnServer: (await events()).filter((event) => event.kind === 'vaccination' && event.status === 'done' && event.date === today).length,
  }
  await shot(page, 'save-error-1440')
  await page.unroute('**/api/v1/pets/*/health/events')

  // Pending: three presses, one request.
  await page.route('**/api/v1/pets/*/health/events', async (route) => {
    await new Promise((done) => setTimeout(done, 1200))
    await route.continue()
  })
  const before = posts.length
  await page.click('.event-form button[type=submit]')
  await page.waitForSelector('.event-form button[aria-disabled=true]')
  summary.checks.pending = { label: text(await page.textContent('.event-form button[type=submit]')), busy: await page.getAttribute('.event-form', 'aria-busy') }
  await page.click('.event-form button[type=submit]', { force: true })
  await page.click('.event-form button[type=submit]', { force: true })
  await page.waitForURL(/\?saved=added/)
  await page.unroute('**/api/v1/pets/*/health/events')
  await page.waitForSelector('.event-record-page')
  await settle(page)
  summary.checks.retry = {
    requestsForRetry: posts.length - before,
    keys: posts.map((post) => post.key),
    sameKey: posts.every((post) => post.key === posts[0].key),
    sentBody: posts[posts.length - 1]?.body ?? null,
    doneRecordsToday: (await events()).filter((event) => event.kind === 'vaccination' && event.status === 'done' && event.date === today).length,
  }
  summary.checks.savedRecord = await readRecord(page)
  summary.checks.savedRecordFocus = await focused(page)
  await shot(page, 'record-done-1440')
  const savedId = summary.checks.savedRecord.url.split('/').pop().split('?')[0]

  await page.reload()
  await page.waitForSelector('.event-record-page')
  summary.checks.savedAfterReload = await readRecord(page)

  // A done record's old edit address shows the record, never a form; the server refuses a change.
  await page.goto(`${SITE}/pets/${murka.id}/health/${savedId}/edit`)
  await page.waitForSelector('.event-record-page')
  summary.checks.doneEditUrl = await readRecord(page)
  await page.goto(`${SITE}/pets/${murka.id}/health/${seededDone.id}/edit`)
  await page.waitForSelector('.event-record-page')
  summary.checks.seededDoneEditUrl = (await readRecord(page)).url
  summary.checks.donePatch = await api(`/pets/${murka.id}/health/events/${savedId}`, tokenA, { method: 'PATCH', body: JSON.stringify({ clinic: 'Другая' }) })

  // Deleting asks by name; «Не удалять» keeps the record and gives focus back.
  await open(page, `/pets/${murka.id}/health/${savedId}`, '.event-record-page')
  await page.click('.event-actions button')
  await page.waitForSelector('.modal')
  summary.checks.deleteDialog = { title: text(await page.textContent('.modal h2')), body: text(await page.textContent('.modal p')), focus: await focused(page) }
  await shot(page, 'delete-dialog-1440', false)
  await page.click('.modal button:has-text("Не удалять")')
  summary.checks.deleteCancelled = { focus: await focused(page), stillThere: (await events()).some((event) => event.id === savedId), dialog: !!(await page.$('.modal')) }
  await page.click('.event-actions button')
  await page.waitForSelector('.modal')
  await page.keyboard.press('Escape')
  summary.checks.deleteEscape = { focus: await focused(page), stillThere: (await events()).some((event) => event.id === savedId) }
  await page.click('.event-actions button')
  await page.click('.modal button:text-is("Удалить")')
  await page.waitForURL(/\/health\/vaccinations\?saved=deleted|\/health\/vaccinations$/)
  await page.waitForSelector('.events-page')
  summary.checks.afterDelete = { notice: text(await page.textContent('.health-saved')), gone: !(await events()).some((event) => event.id === savedId) }

  // ----- MW-03.1: a plan is changed in place -----
  await open(page, `/pets/${murka.id}/health/${seededPlan.id}`, '.event-record-page')
  summary.checks.planRecord = await readRecord(page)
  await shot(page, 'record-planned-1440')
  await page.click('a:has-text("Изменить")')
  await page.waitForSelector('.event-form')
  await settle(page)
  summary.checks.planForm = {
    title: text(await page.textContent('h1')),
    status: !!(await page.$('.event-status')),
    date: await page.inputValue('.event-form input[type=date]'),
    items: await items(page),
    nextFields: await page.$$eval('.event-item-next', (nodes) => nodes.length),
  }
  await shot(page, 'vaccine-plan-edit-1440')
  await page.click('.form-actions a')
  await page.waitForSelector('.event-record-page')
  summary.checks.planCancelBack = page.url().replace(SITE, '')
  await page.click('a:has-text("Изменить")')
  await page.waitForSelector('.event-form')
  const moved = shift(seededPlan.date, 0).slice(0, 8) + '20'
  await page.fill('.event-form input[type=date]', moved)
  await Promise.all([page.waitForURL(/\?saved=changed/), page.click('.event-form button[type=submit]')])
  await page.waitForSelector('.event-record-page')
  const after = (await events()).find((event) => event.id === seededPlan.id)
  summary.checks.planChanged = {
    record: await readRecord(page),
    sameId: !!after,
    date: after?.date,
    sameItems: JSON.stringify(after?.items.map((item) => item.id)) === JSON.stringify(seededPlan.items.map((item) => item.id)),
  }

  // A new plan: «Запланировать» keeps the item, drops the next date, starts with no day.
  await openForm(page, murka.id)
  await page.focus('[role=combobox]')
  await waitOptions(page)
  await page.click('.catalog-option:has(strong:text-is("Нобивак Rabies"))')
  await page.click('.event-status button:has-text("Запланировать")')
  summary.checks.switchToPlan = { date: await page.inputValue('.event-form input[type=date]'), items: await items(page), label: text(await page.textContent('.event-form .field-label')) }
  await page.click('body', { position: { x: 5, y: 5 } })
  await shot(page, 'vaccine-plan-1440')
  // Leaving a changed form asks first.
  await page.click('.form-actions a')
  await page.waitForSelector('.modal')
  summary.checks.leaveDialog = { title: text(await page.textContent('.modal h2')), focus: await focused(page) }
  await page.click('.modal button:has-text("Остаться")')
  summary.checks.leaveStay = { focus: await focused(page), stillForm: !!(await page.$('.event-form')) }

  // ----- MW-03.3: the catalogue fails; the owner's own name; «Без препарата» needs a disease -----
  await page.route('**/api/v1/health/catalog**', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'dependency_unavailable', message: 'down', request_id: 'verify' } }) }),
  )
  await openForm(page, murka.id)
  await page.focus('[role=combobox]')
  await page.waitForSelector('.catalog-error')
  summary.checks.catalogError = await combobox(page)
  await shot(page, 'catalog-error-1440')
  await page.fill('[role=combobox]', 'Вакцина клиники')
  await page.waitForSelector('.catalog-error')
  await page.keyboard.press('ArrowDown')
  summary.checks.manualActive = (await combobox(page)).active
  await page.keyboard.press('Enter')
  await page.waitForTimeout(100)
  summary.checks.manualItem = { items: await items(page), focus: await focused(page) }
  await page.click('.event-item .chip:text-is("Бешенство")')
  await page.focus('[role=combobox]')
  await page.waitForSelector('.catalog-error')
  await page.click('.catalog-option:has-text("Без препарата")')
  const postsBefore = posts.length
  await page.click('.event-form button[type=submit]')
  await page.waitForSelector('.event-targets-error')
  summary.checks.emptyTargets = {
    error: text(await page.textContent('.event-targets-error')),
    focus: await focused(page),
    requests: posts.length - postsBefore,
  }
  await page.click('body', { position: { x: 5, y: 5 } })
  await shot(page, 'targets-1440')
  await page.click('.event-item:nth-of-type(2) .chip:text-is("Ринотрахеит")')
  await Promise.all([page.waitForURL(/\?saved=added/), page.click('.event-form button[type=submit]')])
  await page.waitForSelector('.event-record-page')
  summary.checks.manualSaved = { record: await readRecord(page), body: posts[posts.length - 1]?.body }
  await shot(page, 'record-manual-1440')
  await page.unroute('**/api/v1/health/catalog**')
  const manualId = summary.checks.manualSaved.record.url.split('/').pop().split('?')[0]
  await api(`/pets/${murka.id}/health/events/${manualId}`, tokenA, { method: 'DELETE' })

  // ----- MW-03.2: a dog gets dog products; a stale search is dropped -----
  await openForm(page, bobik.id)
  await page.focus('[role=combobox]')
  await waitOptions(page)
  const dogList = await combobox(page)
  summary.checks.dogCatalog = { options: dogList.options, note: dogList.note, catProducts: dogList.options.filter((name) => CAT_ONLY.includes(name)) }
  await shot(page, 'dog-vaccine-1440')
  await page.keyboard.type('tricat')
  await page.waitForTimeout(400)
  await waitOptions(page)
  const dogTricat = await combobox(page)
  summary.checks.dogTricat = { options: dogTricat.options, note: dogTricat.note, status: dogTricat.status }
  await shot(page, 'dog-empty-1440')

  // A slow search for «нобив» on Мурка, then a new query at once: the old one is aborted.
  const failed = []
  page.on('requestfailed', (request) => {
    if (request.url().includes('/health/catalog')) failed.push({ url: decodeURIComponent(request.url().replace(SITE, '')), error: request.failure()?.errorText })
  })
  await page.route('**/api/v1/health/catalog?*q=%D0%BD%D0%BE%D0%B1%D0%B8%D0%B2*', async (route) => {
    await new Promise((done) => setTimeout(done, 2500))
    await route.continue().catch(() => {})
  })
  await openForm(page, murka.id)
  await page.focus('[role=combobox]')
  await waitOptions(page)
  await page.keyboard.type('нобив')
  await page.waitForTimeout(600)
  await page.fill('[role=combobox]', 'пурев')
  await page.waitForTimeout(3000)
  await waitOptions(page)
  summary.checks.staleQuery = { options: (await combobox(page)).options, aborted: failed.slice() }

  // The same slow search, then another pet's form by client-side navigation.
  failed.length = 0
  await page.fill('[role=combobox]', '')
  await page.keyboard.type('нобив')
  await page.waitForTimeout(600)
  const clientNav = await page.evaluate((href) => {
    const router = window.next?.router
    if (!router?.push) return false
    router.push(href)
    return true
  }, newHref(bobik.id))
  if (!clientNav) await page.goto(`${SITE}${newHref(bobik.id)}`)
  await page.waitForFunction((name) => document.querySelector('.pagehead p')?.textContent.startsWith(name), 'Бобик')
  await page.waitForTimeout(3000)
  await page.focus('[role=combobox]')
  await waitOptions(page)
  const afterSwitch = await combobox(page)
  summary.checks.petSwitch = { clientSideNavigation: clientNav, aborted: failed.slice(), options: afterSwitch.options, catProducts: afterSwitch.options.filter((name) => CAT_ONLY.includes(name)) }
  await page.unroute('**/api/v1/health/catalog?*q=%D0%BD%D0%BE%D0%B1%D0%B8%D0%B2*')

  // Unknown and closed addresses.
  summary.checks.notFoundRoutes = {}
  for (const path of [`/pets/${murka.id}/health/00000000-0000-4000-8000-000000000000`, `/pets/${murka.id}/health/new?type=parasite`, `/pets/${murka.id}/health/parasites`]) {
    await page.goto(`${SITE}${path}`)
    await page.waitForLoadState('networkidle')
    summary.checks.notFoundRoutes[path] = { h1: text(await page.textContent('h1').catch(() => '')), form: !!(await page.$('.event-form, .event-record-page')) }
  }
  await context.close()
}

// ---------- Owner A, phone ----------
{
  const { context, page } = await signedInPage('owner-a@fixture.local', 390)
  summary.checks.overflow390 = {}
  await open(page, sectionHref(murka.id), '.events-page')
  summary.checks.overflow390.vaccines = await overflow(page)
  await shot(page, 'vaccines-390', false)
  await phoneFullShot(page, 'vaccines-390-full')
  await open(page, sectionHref(bobik.id), '.events-page')
  summary.checks.overflow390.vaccinesEmpty = await overflow(page)
  await phoneFullShot(page, 'vaccines-empty-390-full')
  await openForm(page, murka.id)
  await page.focus('[role=combobox]')
  await waitOptions(page)
  summary.checks.overflow390.catalog = await overflow(page)
  summary.checks.catalogInsideScreen390 = await page.$eval('.catalog-popup', (node) => {
    const box = node.getBoundingClientRect()
    return box.left >= 0 && box.right <= window.innerWidth
  })
  await shot(page, 'catalog-390', false)
  await page.click('.catalog-option:has(strong:text-is("Нобивак Tricat Trio"))')
  await page.click("[role=combobox]")
  await waitOptions(page)
  await page.click('.catalog-option:has(strong:text-is("Нобивак Rabies"))')
  await page.click('body', { position: { x: 5, y: 5 } })
  summary.checks.overflow390.form = await overflow(page)
  await phoneFullShot(page, 'vaccine-done-390-full')
  await openForm(page, bobik.id)
  await page.focus('[role=combobox]')
  await waitOptions(page)
  await shot(page, 'dog-vaccine-390', false)
  await page.route('**/api/v1/health/catalog**', (route) => route.abort('internetdisconnected'))
  await openForm(page, murka.id)
  await page.focus('[role=combobox]')
  await page.waitForSelector('.catalog-error')
  summary.checks.overflow390.catalogError = await overflow(page)
  await shot(page, 'catalog-error-390', false)
  await page.unroute('**/api/v1/health/catalog**')
  await open(page, `/pets/${murka.id}/health/${seededDone.id}`, '.event-record-page')
  summary.checks.overflow390.recordDone = await overflow(page)
  await phoneFullShot(page, 'record-done-390-full')
  await open(page, `/pets/${murka.id}/health/${seededPlan.id}`, '.event-record-page')
  summary.checks.overflow390.recordPlanned = await overflow(page)
  await phoneFullShot(page, 'record-planned-390-full')
  await context.close()
}

// ---------- Other widths ----------
{
  const { context, page } = await signedInPage('owner-a@fixture.local', 1440)
  summary.checks.overflowByWidth = {}
  for (const width of [1150, 1024, 900, 768, 760, 360, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await open(page, sectionHref(murka.id), '.events-page')
    summary.checks.overflowByWidth[`vaccines ${width}`] = await overflow(page)
    await openForm(page, murka.id)
    await page.focus('[role=combobox]')
    await waitOptions(page)
    await page.click('.catalog-option:has(strong:text-is("Нобивак Tricat Trio"))')
    summary.checks.overflowByWidth[`form ${width}`] = await overflow(page)
    await open(page, `/pets/${murka.id}/health/${seededDone.id}`, '.event-record-page')
    summary.checks.overflowByWidth[`record ${width}`] = await overflow(page)
  }
  await context.close()
}

// ---------- Owner B: someone else's vaccinations ----------
{
  const before = await events()
  const { context, page } = await signedInPage('owner-b@fixture.local', 1440)
  const requests = []
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/')) requests.push(request.url())
  })
  summary.checks.foreignPages = {}
  for (const path of [sectionHref(murka.id), newHref(murka.id), `/pets/${murka.id}/health/${seededDone.id}`, `/pets/${murka.id}/health/${seededPlan.id}/edit`]) {
    const response = await page.goto(`${SITE}${path}`)
    await page.waitForLoadState('networkidle')
    const html = await page.content()
    summary.checks.foreignPages[path] = {
      status: response.status(),
      h1: text(await page.textContent('h1').catch(() => '')),
      shown: !!(await page.$('.events-page, .event-form, .event-record-page')),
      leaks: ['Нобивак', 'Айболит', 'Мурка · Кошка'].filter((word) => html.includes(word)),
    }
  }
  summary.checks.foreignApiRequests = requests
  await shot(page, 'foreign-vaccines-1440')
  await context.close()

  summary.checks.foreignApi = {
    read: (await api(`/pets/${murka.id}/health`, tokenB)).status,
    add: (await api(`/pets/${murka.id}/health/events`, tokenB, { method: 'POST', body: JSON.stringify({ kind: 'vaccination', status: 'done', date: today, items: [{ targets: ['rabies'] }] }) })).status,
    changePlan: (await api(`/pets/${murka.id}/health/events/${seededPlan.id}`, tokenB, { method: 'PATCH', body: JSON.stringify({ clinic: 'взлом' }) })).status,
    deleteDone: (await api(`/pets/${murka.id}/health/events/${seededDone.id}`, tokenB, { method: 'DELETE' })).status,
  }
  summary.checks.ownerARecordsUntouched = JSON.stringify(await events()) === JSON.stringify(before)
}

summary.consoleErrors = consoleErrors

await browser.close()
console.log(JSON.stringify(summary, null, 2))
