/**
 * MW-01 acceptance run against the local stack: screenshots and checks for
 * docs/verification/medical-record-web-01.md.
 *
 * Needs: the local Supabase stack, the site on http://localhost:3100 started
 * with apps/web/.env.integration (.claude/launch.json «web-local»), the demo
 * pets (apps/web/scripts/seed-medical-record-demo.mjs), Playwright and Chrome:
 *
 *   PLAYWRIGHT=/path/to/node_modules/playwright \
 *   CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *   node docs/verification/medical-record-web-01/verify.mjs
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

async function apiStatus(path, bearer) {
  const response = await fetch(`${SITE}/api/v1${path}`, { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} })
  return { status: response.status, body: await response.json().catch(() => null) }
}

const tokenA = await token('owner-a@fixture.local')
const tokenB = await token('owner-b@fixture.local')
const pets = (await apiStatus('/pets', tokenA)).body
// The demo pets carry the seed script's note; the fixture «Мурка» (11111111-…) is not one of them.
const DEMO_NOTE = 'Демо медкарты (seed-medical-record-demo)'
const murka = pets.find((pet) => pet.name === 'Мурка' && pet.notes === DEMO_NOTE)
const bobik = pets.find((pet) => pet.name === 'Бобик' && pet.notes === DEMO_NOTE)
if (!murka || !bobik) throw new Error('Seed the demo pets first (apps/web/scripts/seed-medical-record-demo.mjs)')

const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true })
const summary = { site: SITE, murka: murka.id, bobik: bobik.id, checks: {} }
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

async function openRecord(page, id) {
  await page.goto(`${SITE}/pets/${id}`)
  await page.waitForSelector('.health-page, .health-problem', { timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => Promise.all([...document.images].map((image) => image.decode().catch(() => null))))
}

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
const shot = (page, name, fullPage = true) => page.screenshot({ path: resolve(here, `${name}.png`), fullPage })

/**
 * A whole phone page in one picture. The bottom navigation and the pinned
 * actions are fixed to the viewport; for this export only they are moved to
 * the end of the page, as the design's own -390-full screenshots do.
 */
async function phoneFullShot(page, name) {
  const style = await page.addStyleTag({ content: 'body{position:relative}.mobile-nav{position:absolute!important}' })
  await shot(page, name)
  await style.evaluate((node) => node.remove())
}

/** Tab through the page and record what gets focus, until the focus leaves the record. */
async function tabOrder(page, steps = 40) {
  await page.evaluate(() => document.activeElement?.blur())
  const seen = []
  for (let i = 0; i < steps; i += 1) {
    await page.keyboard.press('Tab')
    seen.push(
      await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return null
        const text = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60)
        const box = el.getBoundingClientRect()
        const visible = box.width > 0 && box.height > 0
        return `${el.tagName.toLowerCase()}${el.getAttribute('href') ? `[${el.getAttribute('href')}]` : ''} ${text}${visible ? '' : ' (hidden)'}`
      }),
    )
  }
  return seen.filter(Boolean)
}

// ---------- Owner A, desktop ----------
{
  const { context, page } = await signedInPage('owner-a@fixture.local', 1440)

  await page.goto(`${SITE}/pets`)
  await page.waitForSelector('.compact-pets')
  summary.checks.petListLinks = await page.$$eval('.compact-pet', (links) => links.map((link) => `${link.querySelector('h3')?.textContent} → ${link.getAttribute('href')}`))
  await shot(page, 'pets-1440')

  // 1: direct link, then a reload.
  await openRecord(page, murka.id)
  summary.checks.murkaDirect = await page.textContent('.health-head h1')
  await shot(page, 'murka-1440')
  summary.checks.murkaOverflow1440 = await overflow(page)
  await page.reload()
  await page.waitForSelector('.health-page')
  summary.checks.murkaAfterReload = await page.textContent('.health-head h1')
  summary.checks.murkaDue = await page.$$eval('.due-row', (rows) => rows.map((row) => row.textContent.replace(/\s+/g, ' ').trim()))
  summary.checks.murkaSections = await page.$$eval('.health-section', (cards) => cards.map((card) => card.textContent.replace(/\s+/g, ' ').trim()))
  summary.checks.murkaHead = await page.textContent('.health-head').then((text) => text.replace(/\s+/g, ' ').trim())
  summary.checks.hiddenActions = await page.evaluate(() => ({
    addRecord: !!document.querySelector('a[href$="/health/new"]'),
    vetSummary: !!document.querySelector('a[href$="/vet-summary"]'),
    sectionAll: document.querySelectorAll('.health-card-head a').length,
    markDone: [...document.querySelectorAll('button')].some((b) => /Сделано/.test(b.textContent)),
  }))
  summary.checks.tabOrder1440 = await tabOrder(page)

  await openRecord(page, bobik.id)
  summary.checks.bobikHead = await page.textContent('.health-head').then((text) => text.replace(/\s+/g, ' ').trim())
  summary.checks.bobikSections = await page.$$eval('.health-section', (cards) => cards.map((card) => card.textContent.replace(/\s+/g, ' ').trim()))
  summary.checks.bobikHasDue = !!(await page.$('.health-due'))
  summary.checks.bobikOverflow1440 = await overflow(page)
  await shot(page, 'bobik-1440')

  // Loading: the record request held back.
  let release
  const held = new Promise((resolve) => (release = resolve))
  await page.route('**/api/v1/pets/*/health', async (route) => {
    await held
    await route.continue()
  })
  await page.goto(`${SITE}/pets/${murka.id}`)
  await page.waitForSelector('.health-skeleton')
  await shot(page, 'loading-1440')
  release()
  await page.waitForSelector('.health-page')
  await page.unroute('**/api/v1/pets/*/health')

  // 5: the request fails on first load — an error with a retry, no record.
  await page.route('**/api/v1/pets/*/health', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal_error', message: 'Unexpected server error', request_id: 'test' } }) }))
  await page.goto(`${SITE}/pets/${murka.id}`)
  await page.waitForSelector('.health-problem')
  summary.checks.failedFirstLoad = {
    text: (await page.textContent('.health-problem')).replace(/\s+/g, ' ').trim(),
    recordShown: !!(await page.$('.health-page')),
    focused: await page.evaluate(() => document.activeElement?.id),
  }
  await shot(page, 'load-error-1440')
  await page.unroute('**/api/v1/pets/*/health')
  await page.click('.health-problem button')
  await page.waitForSelector('.health-page')
  summary.checks.retryRecovers = await page.textContent('.health-head h1')

  // 5: a refresh fails over data already shown — old data with a banner and a retry.
  await page.click('.health-form-link')
  await page.waitForURL(/\/edit$/)
  await page.route('**/api/v1/pets/*/health', (route) => route.abort('internetdisconnected'))
  await page.click(`a[href="/pets/${murka.id}"]`)
  await page.waitForSelector('.health-stale')
  summary.checks.staleBanner = {
    text: (await page.textContent('.health-stale')).replace(/\s+/g, ' ').trim(),
    recordStillShown: !!(await page.$('.health-page')),
  }
  await shot(page, 'stale-1440')
  await page.unroute('**/api/v1/pets/*/health')
  await page.click('.health-stale button')
  await page.waitForSelector('.health-stale', { state: 'detached' })
  summary.checks.staleRetryClears = true

  // 2: the API answers the owner, before the session is ended below.
  summary.checks.apiOwnerA = (await apiStatus(`/pets/${murka.id}/health`, tokenA)).status

  // 2: signing out leaves nothing: the page and the API both refuse.
  await page.goto(`${SITE}/pets/${murka.id}`)
  await page.waitForSelector('.health-page')
  await page.click('.sidebar button:has-text("Выйти")')
  await page.waitForURL((url) => !url.pathname.startsWith('/pets'))
  await page.goto(`${SITE}/pets/${murka.id}`)
  summary.checks.afterSignOut = { url: page.url(), recordShown: !!(await page.$('.health-page')) }
  summary.checks.afterSignOutApi = await page.evaluate(async (id) => (await fetch(`/api/v1/pets/${id}/health`)).status, murka.id)
  await shot(page, 'signed-out-1440')
  await context.close()
}

// ---------- Owner A, phone ----------
{
  const { context, page } = await signedInPage('owner-a@fixture.local', 390)
  await openRecord(page, murka.id)
  summary.checks.murkaOverflow390 = await overflow(page)
  await shot(page, 'murka-390', false)
  await phoneFullShot(page, 'murka-390-full')
  summary.checks.tabOrder390 = await tabOrder(page, 12)
  await openRecord(page, bobik.id)
  summary.checks.bobikOverflow390 = await overflow(page)
  await shot(page, 'bobik-390', false)
  await phoneFullShot(page, 'bobik-390-full')
  await page.route('**/api/v1/pets/*/health', (route) => route.abort('internetdisconnected'))
  await page.goto(`${SITE}/pets/${murka.id}`)
  await page.waitForSelector('.health-problem')
  summary.checks.loadError390Overflow = await overflow(page)
  await shot(page, 'load-error-390', false)
  await context.close()
}

// ---------- Other widths: no horizontal scroll between the breakpoints ----------
{
  const { context, page } = await signedInPage('owner-a@fixture.local', 1440)
  summary.checks.overflowByWidth = {}
  for (const width of [1150, 1024, 900, 768, 760, 360, 320]) {
    await page.setViewportSize({ width, height: 900 })
    for (const pet of [murka, bobik]) {
      await openRecord(page, pet.id)
      summary.checks.overflowByWidth[`${pet.name} ${width}`] = await overflow(page)
    }
  }
  await context.close()
}

// ---------- Owner B: someone else's pet ----------
{
  const { context, page } = await signedInPage('owner-b@fixture.local', 1440)
  const requests = []
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/')) requests.push(request.url())
  })
  const response = await page.goto(`${SITE}/pets/${murka.id}`)
  await page.waitForLoadState('networkidle')
  const html = await page.content()
  summary.checks.foreignPage = {
    status: response.status(),
    recordShown: !!(await page.$('.health-page')),
    // Words only Мурка's record holds (the dictionary itself contains «Мурка» as a placeholder).
    leaksRecord: ['Хронический гастрит', 'Бравекто', 'Нобивак'].filter((word) => html.includes(word)),
    apiRequests: requests,
  }
  await shot(page, 'foreign-1440')
  await context.close()
}

summary.checks.api = {
  ownerB: await apiStatus(`/pets/${murka.id}/health`, tokenB),
  noToken: await apiStatus(`/pets/${murka.id}/health`, null),
  ownerBChecks: (await apiStatus(`/checks?pet_id=${murka.id}&limit=3`, tokenB)).body,
}
summary.consoleErrors = consoleErrors

await browser.close()
console.log(JSON.stringify(summary, null, 2))
