/**
 * MW-09 Task 6: the medical record at 200 % browser zoom in Chrome (WCAG 1.4.4
 * «Resize text», 1.4.10 «Reflow»). Chrome's zoom of a desktop window halves its
 * CSS width and doubles the device pixel ratio, so a 1440×1000 window at 200 %
 * is a 720×500 CSS viewport drawn at 2×, and a 1280×800 one is 640×400. Each
 * page is opened so, read for horizontal scrolling and for boxes of text or
 * controls that overlap, and photographed whole.
 *
 * Needs the local stack, the site on :3100 («web-local»), the demo seed, and
 * Playwright + Chrome (PLAYWRIGHT, CHROME) — as the verify.mjs scripts. Local
 * only. Reads, never writes: nothing is saved in the forms.
 *
 *   PLAYWRIGHT=… CHROME=… node docs/verification/medical-record-web-09/task6-zoom200.mjs
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
const baron = pets.find((pet) => pet.name.startsWith('Барон') && pet.notes === DEMO_NOTE)
if (!murka || !baron) throw new Error('Seed the demo pets first (apps/web/scripts/seed-medical-record-demo.mjs)')
const record = await api(`/pets/${murka.id}/health`)
const plan = record.events.find((event) => event.kind === 'vaccination' && event.status === 'planned')
const visit = record.events.find((event) => event.kind === 'visit' && event.status === 'done')
const course = record.medications.find((item) => item.ongoing)

/** The pages: the record, the forms (new and correction), the summary for the vet. */
const PAGES = [
  ['record', `/pets/${murka.id}`, '.health-grid'],
  ['due', `/pets/${murka.id}/health/due`, '.due-page'],
  ['form-vaccination', `/pets/${murka.id}/health/new?type=vaccination`, 'form.event-form'],
  ['form-complete', `/pets/${murka.id}/health/${plan.id}/complete?item=${plan.items[0].id}`, 'form.complete-form'],
  ['form-weight', `/pets/${murka.id}/health/new?type=weight`, 'form.weight-form'],
  ['form-visit', `/pets/${murka.id}/health/new?type=visit`, 'form.visit-form'],
  ['form-course', `/pets/${murka.id}/health/${course.id}/edit`, 'form.course-form'],
  ['form-pet', `/pets/${murka.id}/edit`, 'form.pet-form'],
  ['visit-record', `/pets/${murka.id}/health/${visit.id}`, '.visit-record-page'],
  ['vet-summary', `/pets/${murka.id}/vet-summary`, '.vet-summary-body'],
  ['vet-summary-long', `/pets/${baron.id}/vet-summary`, '.vet-summary-body'],
]

/** Chrome at 200 % on two common desktop windows. */
const WINDOWS = [
  { name: '1440', width: 720, height: 500 },
  { name: '1280', width: 640, height: 400 },
]

const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true })
const results = { site: SITE, zoom: '200%', windows: WINDOWS, pages: {} }

/**
 * What a reader at 200 % would meet: the page wider than the window (a
 * horizontal scrollbar), and boxes that overlap — text or controls drawn on
 * top of each other. Only leaves are compared (a text run, a control, an
 * image), never an element with what it contains, and only what is drawn —
 * not the closed account menu, not the table heads kept for screen readers
 * alone. Layers pinned above the page by design — the bottom navigation, the
 * record's «Добавить запись / Для врача» bar (≤760 px), dialogs, the dev
 * overlay — are left out: the page scrolls under them and keeps room below
 * its last line for them.
 */
function inspect() {
  const doc = document.documentElement
  const wide = doc.scrollWidth > window.innerWidth + 1
  const widest = wide
    ? [...document.querySelectorAll('body *')]
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(el).visibility !== 'hidden')
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} → ${Math.round(el.getBoundingClientRect().right)}`)
    : []
  const pinned = (el) => {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      if (getComputedStyle(node).position === 'fixed') return true
    }
    return false
  }
  const readerOnly = (el) => {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const rect = node.getBoundingClientRect()
      if (rect.width <= 1 || rect.height <= 1) return true
    }
    return false
  }
  const skip = (el) =>
    el.closest('.mobile-nav, .sidebar, [role=dialog], .sr-only, svg, [aria-hidden=true], .skeleton-block, nextjs-portal') ||
    !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) ||
    pinned(el) ||
    readerOnly(el)
  const leafSelector = 'button, a, input, select, textarea, label, img, h1, h2, h3, p, li, dt, dd, td, th, span, strong'
  const leaves = [...document.querySelectorAll(leafSelector)].filter((el) => {
    if (skip(el)) return false
    if (el.querySelector(leafSelector)) return false
    const rect = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    return rect.width > 2 && rect.height > 2 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0
  })
  const boxes = leaves.map((el) => ({ el, rect: el.getBoundingClientRect() }))
  const overlaps = []
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i].rect
      const b = boxes[j].rect
      const x = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      // More than a hairline both ways: two boxes drawn over each other.
      if (x > 2 && y > 2) {
        const name = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : ''} «${(el.textContent || el.getAttribute('aria-label') || el.value || '').trim().slice(0, 30)}»`
        overlaps.push(`${name(boxes[i].el)} × ${name(boxes[j].el)}`)
      }
    }
  }
  return { scrollWidth: doc.scrollWidth, innerWidth: window.innerWidth, horizontalScroll: wide, widest, overlaps: overlaps.slice(0, 10), leaves: boxes.length }
}

for (const view of WINDOWS) {
  const context = await browser.newContext({
    viewport: { width: view.width, height: view.height },
    deviceScaleFactor: 2,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
  })
  const page = await context.newPage()
  await page.goto(`${SITE}/login`)
  await page.fill('input[type=email]', 'owner-a@fixture.local')
  await page.fill('input[type=password]', password)
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login')), page.press('input[type=password]', 'Enter')])
  for (const [name, path, selector] of PAGES) {
    await page.goto(`${SITE}${path}`)
    await page.waitForSelector(selector, { timeout: 60_000 })
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(300)
    const found = await page.evaluate(inspect)
    // The fixed bottom navigation would cover the page's end in a full-page shot: drawn in the flow for the photo.
    // The viewport as the reader sees it at 200 %, pinned bars included.
    await page.screenshot({ path: resolve(here, `zoom200-${name}-${view.name}-viewport.png`) })
    // The whole page: the pinned bars would cover its middle in a full-page shot, so they are drawn at its end.
    const style = await page.addStyleTag({
      content: 'body{position:relative}.mobile-nav{position:absolute!important}.health-actions{position:absolute!important;bottom:66px!important}',
    })
    const file = `zoom200-${name}-${view.name}.png`
    await page.screenshot({ path: resolve(here, file), fullPage: true })
    await style.evaluate((node) => node.remove())
    results.pages[`${name} ${view.name}`] = { path, ...found, screenshot: file }
  }
  await context.close()
}
await browser.close()
console.log(JSON.stringify(results, null, 2))
