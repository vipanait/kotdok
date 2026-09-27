/**
 * MW-09 Task 4, in Chrome: the printed summary. A check is one line on
 * paper, cut at a word with «…», and whole on screen; a filled record
 * («Мурка») fits one A4 sheet; the disclaimer is printed once under the
 * printed heading and in the page margins of every page, and not again at
 * the end; without page margins (chrome-*-no-margins.pdf) it is still there;
 * the file name keeps the whole date and stays within the 80 characters
 * Safari on iOS names a PDF by.
 *
 * Needs the local stack, the site on http://localhost:3100 («web-local»),
 * the fixture owners, freshly seeded demo pets
 * (apps/web/scripts/seed-medical-record-demo.mjs: «Мурка», «Бобик», «Барон …»),
 * Playwright and Chrome:
 *
 *   PLAYWRIGHT=/path/to/node_modules/playwright \
 *   CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *   node docs/verification/medical-record-web-09/task4-print.mjs > docs/verification/medical-record-web-09/task4-print-output.json
 *
 * Writes PNGs and PDFs (chrome-*.pdf) next to this file and prints JSON; the
 * PDFs are then read by task4-pdf-check.py. Read-only on the data. Local only.
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
const api = async (path) => (await fetch(`${SITE}/api/v1${path}`, { headers: { authorization: `Bearer ${token}` } })).json()
const demo = (await api('/pets')).filter((pet) => pet.notes === 'Демо медкарты (seed-medical-record-demo)')
const pets = {
  murka: demo.find((pet) => pet.name === 'Мурка'),
  bobik: demo.find((pet) => pet.name === 'Бобик'),
  baron: demo.find((pet) => pet.name.startsWith('Барон')),
}
if (!pets.murka || !pets.bobik || !pets.baron) throw new Error('Seed the demo pets first (apps/web/scripts/seed-medical-record-demo.mjs)')

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date())
const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true })
const result = { site: SITE, today, checks: {} }
const consoleErrors = []

async function signedInPage(width) {
  const context = await browser.newContext({
    viewport: { width, height: width > 760 ? 1000 : 844 },
    deviceScaleFactor: 1,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
  })
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`${width}: ${message.text()}`)
  })
  await page.goto(`${SITE}/login`)
  await page.fill('input[type=email]', 'owner-a@fixture.local')
  await page.fill('input[type=password]', password)
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login')), page.press('input[type=password]', 'Enter')])
  return { context, page }
}

async function openSummary(page, pet) {
  await page.goto(`${SITE}/pets/${pet.id}/vet-summary`)
  await page.waitForSelector('.vet-summary', { timeout: 60000 })
  await page.evaluate(() => document.fonts.ready)
}

/** Each check as laid out: its lines, whether «…» cuts it, what the owner wrote. */
const readChecks = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.vet-check')].map((item) => {
      const style = getComputedStyle(item)
      const lineHeight = Number.parseFloat(getComputedStyle(item.querySelector('.vet-check-text')).lineHeight)
      const words = [...item.querySelectorAll('.vet-check-word')]
      const box = item.getBoundingClientRect()
      // A word is shown when its box starts on the check's first line (below it, it is clipped).
      const shown = words.filter((word) => word.getBoundingClientRect().top < box.top + lineHeight / 2)
      return {
        text: item.querySelector('.vet-check-text').textContent,
        order: [...item.children].map((child) => child.className),
        clamp: style.webkitLineClamp,
        lines: Math.round(box.height / lineHeight),
        cut: item.scrollHeight > item.clientHeight + 1,
        lastWordShown: shown.at(-1)?.textContent ?? null,
        wordsShown: shown.length,
        wordsTotal: words.length,
      }
    }),
  )

// ---------- Screen: the check whole, level first (web v1 «summary») ----------
result.checks.screen = {}
for (const width of [1440, 390]) {
  const { context, page } = await signedInPage(width)
  for (const key of ['murka', 'baron']) {
    await openSummary(page, pets[key])
    result.checks.screen[`${key} ${width}`] = {
      title: await page.title(),
      footerShown: await page.evaluate(() => getComputedStyle(document.querySelector('.vet-summary-footer')).display !== 'none'),
      checks: await readChecks(page),
    }
    const card = page.locator('section:has(#vet-checks-title)')
    await card.scrollIntoViewIfNeeded()
    await card.screenshot({ path: resolve(here, `task4-${key}-checks-screen-${width}.png`) })
  }
  await context.close()
}

// ---------- Print: one line a check, the footer once, PDFs ----------
result.checks.print = {}
{
  const { context, page } = await signedInPage(1440)
  for (const key of ['murka', 'bobik', 'baron']) {
    await openSummary(page, pets[key])
    await page.emulateMedia({ media: 'print' })
    result.checks.print[key] = {
      closingFooterPrinted: await page.evaluate(() => getComputedStyle(document.querySelector('.vet-summary-footer')).display !== 'none'),
      // The disclaimer in the flow, under «Медкарта: …»: printed whatever the page margins (fix round 1).
      printNote: await page.evaluate(() => {
        const note = document.querySelector('.vet-print-head .vet-print-note')
        return note && getComputedStyle(note).display !== 'none' ? note.textContent : null
      }),
      theadRepeats: await page.evaluate(() => [...document.querySelectorAll('.vet-table thead')].every((node) => getComputedStyle(node).display === 'table-header-group')),
      checks: await readChecks(page),
    }
    await page.pdf({ path: resolve(here, `chrome-${key}.pdf`), preferCSSPageSize: true, printBackground: false })
    await page.emulateMedia({ media: 'screen' })
  }
  await context.close()
}
// The lines measured at the width of the printed A4 text: 210 − 2 × 14 mm = 182 mm = 688 px.
{
  const { context, page } = await signedInPage(688)
  for (const key of ['murka', 'baron']) {
    await openSummary(page, pets[key])
    await page.emulateMedia({ media: 'print' })
    result.checks.print[key].checksAtA4Width = await readChecks(page)
    await page.screenshot({ path: resolve(here, `task4-${key}-print-view-a4.png`), fullPage: true })
    await page.emulateMedia({ media: 'screen' })
  }
  await context.close()
}

// ---------- Without page margins the disclaimer is still printed ----------
// Chrome's dialog «Поля: нет» takes the margins, and the margin boxes with them; emulated here by
// a rule that wins over the page's own @page margins. Safari never prints the margin boxes.
{
  const { context, page } = await signedInPage(1440)
  for (const key of ['murka', 'baron']) {
    await openSummary(page, pets[key])
    await page.addStyleTag({ content: '@page { margin: 0 !important; }' })
    await page.emulateMedia({ media: 'print' })
    await page.pdf({ path: resolve(here, `chrome-${key}-no-margins.pdf`), preferCSSPageSize: true, printBackground: false })
    await page.emulateMedia({ media: 'screen' })
  }
  await context.close()
}

// ---------- The file name: the whole date, at most 80 characters ----------
result.checks.fileTitle = Object.fromEntries(
  Object.entries(result.checks.screen)
    .filter(([key]) => key.endsWith('1440'))
    .map(([key, value]) => [key, { title: value.title, length: value.title.length, endsWithDate: value.title.endsWith(today.split('-').reverse().join('.')) }]),
)

result.consoleErrors = consoleErrors
await browser.close()
console.log(JSON.stringify(result, null, 2))
