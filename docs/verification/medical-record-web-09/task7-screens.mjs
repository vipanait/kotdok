/**
 * MW-09 Task 7: the pictures the stage report still lacked, at 390 and 1440 px.
 *
 * - «Уточнить» the pet form's weight of a pet with no history (Task 1, item 6):
 *   Бобик's weight page and the dating form it opens, with the form's value
 *   filled in and the day left empty. Nothing is saved.
 * - The phone-width record walked with Tab (Task 7, ≤760 px): the first focus
 *   that lands in the lower third of the window is photographed, and no focus
 *   may sit under the pinned actions bar or the bottom navigation.
 *
 * Needs the local stack, the site on :3100 («web-local»), the demo seed, and
 * Playwright + Chrome (PLAYWRIGHT, CHROME). Local only; reads, never writes.
 *
 *   PLAYWRIGHT=… CHROME=… node docs/verification/medical-record-web-09/task7-screens.mjs
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
const api = (path) => fetch(`${SITE}/api/v1${path}`, { headers: { authorization: `Bearer ${token}` } }).then((response) => response.json())
const DEMO_NOTE = 'Демо медкарты (seed-medical-record-demo)'
const pets = await api('/pets')
const murka = pets.find((pet) => pet.name === 'Мурка' && pet.notes === DEMO_NOTE)
const bobik = pets.find((pet) => pet.name === 'Бобик' && pet.notes === DEMO_NOTE)
if (!murka || !bobik) throw new Error('Seed the demo pets first (apps/web/scripts/seed-medical-record-demo.mjs)')

const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true })
const results = { site: SITE, dating: {}, focus: {} }

for (const [name, viewport] of [
  ['390', { width: 390, height: 844 }],
  ['1440', { width: 1440, height: 1000 }],
]) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: 'ru-RU', timezoneId: 'Europe/Moscow' })
  const page = await context.newPage()
  await page.goto(`${SITE}/login`)
  await page.fill('input[type=email]', 'owner-a@fixture.local')
  await page.fill('input[type=password]', password)
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login')), page.press('input[type=password]', 'Enter')])

  // Бобик has only the pet form's weight: its row offers «Уточнить», which opens the dating form.
  await page.goto(`${SITE}/pets/${bobik.id}/health/weight`)
  await page.waitForSelector('.weight-page, .health-page', { timeout: 60_000 })
  await page.waitForLoadState('networkidle')
  const refine = page.locator('a', { hasText: 'Уточнить' }).first()
  const refineHref = await refine.getAttribute('href')
  await page.screenshot({ path: resolve(here, `task7-weight-form-origin-${name}.png`), fullPage: true })
  await refine.click()
  await page.waitForSelector('form.weight-form', { timeout: 60_000 })
  await page.waitForLoadState('networkidle')
  const form = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('form.weight-form input')]
    const text = document.querySelector('form.weight-form')?.textContent ?? ''
    return {
      url: location.pathname + location.search,
      values: inputs.map((input) => ({ type: input.type, value: input.value })),
      datingHint: text.includes('Вес из анкеты. Укажите дату, когда он был таким.'),
      horizontalScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
    }
  })
  await page.screenshot({ path: resolve(here, `task7-weight-dating-form-${name}.png`), fullPage: true })
  results.dating[name] = { formWeight: bobik.weight_kg, refineHref, ...form }

  // The record at phone width, walked with Tab.
  if (name === '390') {
    await page.goto(`${SITE}/pets/${murka.id}`)
    await page.waitForSelector('.health-grid', { timeout: 60_000 })
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => window.scrollTo(0, 0))
    const walked = []
    let photographed = false
    const seen = new Set()
    for (let step = 0; step < 120; step += 1) {
      await page.keyboard.press('Tab')
      const state = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return null
        if (el.closest('nextjs-portal') || el.tagName.toLowerCase() === 'nextjs-portal') return { skip: true }
        const bars = [...document.querySelectorAll('.mobile-nav, .health-actions')].filter((bar) => getComputedStyle(bar).position === 'fixed')
        const rect = el.getBoundingClientRect()
        const onBar = bars.some((bar) => bar.contains(el))
        const covered = onBar
          ? []
          : bars
              .filter((bar) => {
                const box = bar.getBoundingClientRect()
                return Math.min(rect.bottom, box.bottom) - Math.max(rect.top, box.top) > 1 && Math.min(rect.right, box.right) - Math.max(rect.left, box.left) > 1
              })
              .map((bar) => `.${[...bar.classList].join('.')}`)
        return {
          key: `${el.tagName}|${el.getAttribute('href') ?? ''}|${(el.textContent ?? '').trim().slice(0, 40)}`,
          name: `${el.tagName.toLowerCase()} «${(el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)}»`,
          onBar,
          covered,
          outside: rect.bottom <= 0 || rect.top >= window.innerHeight,
          bottom: Math.round(rect.bottom),
          barsTop: Math.round(Math.min(...bars.map((bar) => bar.getBoundingClientRect().top))),
          viewport: window.innerHeight,
        }
      })
      if (!state) break
      if (state.skip) continue
      if (seen.has(state.key)) break
      seen.add(state.key)
      walked.push(state)
      if (!photographed && !state.onBar && state.bottom > state.viewport * 0.6) {
        photographed = true
        await page.screenshot({ path: resolve(here, 'task7-record-focus-above-bars-390.png') })
      }
    }
    results.focus[name] = {
      focused: walked.length,
      hidden: walked.filter((state) => state.outside || state.covered.length > 0),
      lowest: walked.filter((state) => !state.onBar).reduce((low, state) => (state.bottom > (low?.bottom ?? 0) ? state : low), null),
    }
  }
  await context.close()
}
await browser.close()
console.log(JSON.stringify(results, null, 2))
if (Object.values(results.focus).some((found) => found.hidden.length > 0)) process.exitCode = 1
