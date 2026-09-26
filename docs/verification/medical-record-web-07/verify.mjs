/**
 * MW-07 acceptance run against the local stack: screenshots, print views and
 * Chrome PDFs for docs/verification/medical-record-web-07.md.
 *
 * Needs: the local Supabase stack, the site on http://localhost:3100 started
 * with apps/web/.env.integration (.claude/launch.json «web-local»), freshly
 * seeded demo pets (apps/web/scripts/seed-medical-record-demo.mjs: «Мурка»,
 * «Бобик» and the long «Барон …»), Playwright and Chrome:
 *
 *   PLAYWRIGHT=/path/to/node_modules/playwright \
 *   CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *   node docs/verification/medical-record-web-07/verify.mjs
 *
 * Writes PNGs and PDFs next to this file and prints a JSON summary; the PDFs
 * are then read by pdf-check.py. Read-only on the data: it writes nothing.
 * Local only: it refuses any origin or database that is not localhost.
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

async function api(path, bearer) {
  const response = await fetch(`${SITE}/api/v1${path}`, { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} })
  return { status: response.status, body: await response.json().catch(() => null) }
}

const tokenA = await token('owner-a@fixture.local')
const tokenB = await token('owner-b@fixture.local')
const DEMO_NOTE = 'Демо медкарты (seed-medical-record-demo)'
const pets = (await api('/pets', tokenA)).body.filter((pet) => pet.notes === DEMO_NOTE)
const murka = pets.find((pet) => pet.name === 'Мурка')
const bobik = pets.find((pet) => pet.name === 'Бобик')
const baron = pets.find((pet) => pet.name.startsWith('Барон'))
if (!murka || !bobik || !baron) throw new Error('Seed the demo pets first (apps/web/scripts/seed-medical-record-demo.mjs)')

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date())
const numeric = (day) => day.split('-').reverse().join('.')
const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true })
const result = { site: SITE, today, pets: { murka: murka.id, bobik: bobik.id, baron: baron.id }, checks: {} }
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
    if (message.type() === 'error') consoleErrors.push(`${email} ${width}: ${message.text()}`)
  })
  await page.goto(`${SITE}/login`)
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', password)
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login')), page.press('input[type=password]', 'Enter')])
  return { context, page }
}

const text = (value) => (value ?? '').replace(/\s+/g, ' ').trim()
const shot = (page, name, fullPage = true) => page.screenshot({ path: resolve(here, `${name}.png`), fullPage })
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
const summaryUrl = (pet) => `${SITE}/pets/${pet.id}/vet-summary`

async function openSummary(page, pet) {
  await page.goto(summaryUrl(pet))
  await page.waitForSelector('.vet-summary', { timeout: 30000 })
  await page.evaluate(() => document.fonts.ready)
}

async function phoneFullShot(page, name) {
  const style = await page.addStyleTag({ content: 'body{position:relative}.mobile-nav{position:absolute!important}' })
  await shot(page, name)
  await style.evaluate((node) => node.remove())
}

/** What the page says, part by part, as the owner and the vet read it. */
const readPage = (page) =>
  page.evaluate(() => {
    const t = (node) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim()
    const card = (id) => document.getElementById(id)?.closest('section')
    const rows = (id) => [...(card(id)?.querySelectorAll('tbody tr') ?? [])].map((tr) => [...tr.cells].map(t))
    return {
      h1: t(document.querySelector('h1')),
      subtitle: t(document.querySelector('.vet-summary-head p')),
      pet: [...document.querySelectorAll('.vet-pet p')].map(t),
      important: [...document.querySelectorAll('.vet-fact')].map((fact) => [t(fact.querySelector('dt')), t(fact.querySelector('dd'))]),
      importantNote: t(card('vet-important-title')?.querySelector('.vet-note')),
      vaccinations: rows('vet-vaccinations-title'),
      vaccinationsNote: t(card('vet-vaccinations-title')?.querySelector('.vet-note')),
      parasites: rows('vet-parasites-title'),
      parasitesNote: t(card('vet-parasites-title')?.querySelector('.vet-note')),
      visits: rows('vet-visits-title'),
      visitsNote: t(card('vet-visits-title')?.querySelector('.vet-note')),
      weight: [...(card('vet-weight-title')?.querySelectorAll('p') ?? [])].map(t),
      chart: !!card('vet-weight-title')?.querySelector('svg.weight-chart'),
      checks: [...document.querySelectorAll('.vet-check')].map(t),
      checksNote: t(card('vet-checks-title')?.querySelector('.vet-note')),
      footer: t(document.querySelector('.vet-summary-footer')),
      buttons: [...document.querySelectorAll('.vet-summary-actions button')].map(t),
      hint: t(document.getElementById('vet-summary-pdf-hint')),
      pdfDescribedBy: document.querySelectorAll('.vet-summary-actions button')[1]?.getAttribute('aria-describedby'),
    }
  })

// ---------- Criterion 1: the summary is the saved record ----------
{
  const { context, page } = await signedInPage('owner-a@fixture.local', 1440)
  result.checks.record = {}
  for (const [key, pet] of [['murka', murka], ['bobik', bobik], ['baron', baron]]) {
    const saved = (await api(`/pets/${pet.id}/health/summary`, tokenA)).body
    const record = (await api(`/pets/${pet.id}/health`, tokenA)).body
    await openSummary(page, pet)
    const shown = await readPage(page)
    const vaccinationRecorded = saved.vaccinations.some((row) => row.last_done || row.next)
    result.checks.record[key] = {
      shown,
      matches: {
        vaccinationRows: vaccinationRecorded ? shown.vaccinations.length === saved.vaccinations.length : shown.vaccinations.length === 0,
        vaccinationProducts: saved.vaccinations.every((row) => !row.product || shown.vaccinations.some((cells) => cells[2] === row.product)),
        vaccinationDays: saved.vaccinations.every((row) => !row.last_done || shown.vaccinations.some((cells) => cells[1] === numeric(row.last_done))),
        visits: shown.visits.length === saved.visits.length,
        visitsDays: saved.visits.every((visit, index) => shown.visits[index]?.[0].startsWith(numeric(visit.date))),
        courses: saved.medications.every((course) => shown.important.some(([, value]) => value.includes(course.name))),
        weights: saved.weights.length === 0 || shown.weight[0]?.includes(saved.weights[0].weight_kg.toString().replace('.', ',')),
        checks: shown.checks.length === saved.checks.length,
      },
      // A course that starts later: under «Сейчас» on the medicines page, in neither «Принимает сейчас».
      laterCourses: record.medications.filter((course) => course.started_on && course.started_on > today).map((course) => course.name),
      recordCount:
        record.weights.length + record.events.reduce((n, event) => n + Math.max(1, event.items.length), 0) + record.medications.length,
    }
    if (key === 'baron') {
      await page.goto(`${SITE}/pets/${pet.id}`)
      await page.waitForSelector('.health-page')
      const recordTaking = await page.evaluate(() =>
        [...document.querySelectorAll('.health-facts div')].map((div) => div.textContent).find((line) => line.startsWith('Принимает сейчас')) ?? '',
      )
      await page.goto(`${SITE}/pets/${pet.id}/health/medications`)
      await page.waitForSelector('.courses-page')
      const coursesPage = text(await page.textContent('.courses-page'))
      const later = result.checks.record.baron.laterCourses
      result.checks.record.baron.laterCourse = {
        names: later,
        inRecordTakingNow: later.some((name) => recordTaking.includes(name)),
        inSummaryTakingNow: later.some((name) => shown.important.some(([, value]) => value.includes(name))),
        onMedicinesPage: later.every((name) => coursesPage.includes(name)),
      }
    }
  }
  result.checks.bobikNoAbsence = !/\b(нет болезней|нет аллергий|не болеет|здоров)\b/i.test(JSON.stringify(result.checks.record.bobik.shown))
  await context.close()
}

// ---------- Screens: 1440 and 390, every demo pet ----------
for (const width of [1440, 390]) {
  const { context, page } = await signedInPage('owner-a@fixture.local', width)
  for (const [key, pet] of [['murka', murka], ['bobik', bobik], ['baron', baron]]) {
    await openSummary(page, pet)
    if (width === 390) await phoneFullShot(page, `${key}-summary-390`)
    else await shot(page, `${key}-summary-1440`)
  }
  if (width === 390) {
    await openSummary(page, murka)
    await shot(page, 'murka-summary-390-first-screen', false)
  }
  await context.close()
}

// ---------- The buttons: both open the browser's print dialog, the PDF one says what to choose ----------
{
  const { context, page } = await signedInPage('owner-a@fixture.local', 1440)
  await openSummary(page, murka)
  await page.evaluate(() => {
    window.__prints = []
    // Headless Chrome has no dialog to show: record the call and fire the events the browser fires around it.
    window.print = () => {
      window.dispatchEvent(new Event('beforeprint'))
      window.__prints.push(document.title)
      window.dispatchEvent(new Event('afterprint'))
    }
  })
  const pageTitle = await page.title()
  await page.click('.vet-summary-actions button:has-text("Распечатать")')
  await page.click('.vet-summary-actions button:has-text("Сохранить PDF")')
  result.checks.buttons = {
    titlesWhilePrinting: await page.evaluate(() => window.__prints),
    expectedFileTitle: `Мурка — медкарта — ${numeric(today)}`,
    titleAfter: await page.title(),
    pageTitle,
  }
  await context.close()
}

// ---------- Print view: no frame, no buttons, no shadows; A4 PDFs from Chrome ----------
result.checks.print = {}
for (const width of [1440, 390]) {
  const { context, page } = await signedInPage('owner-a@fixture.local', width)
  for (const [key, pet] of [['murka', murka], ['bobik', bobik], ['baron', baron]]) {
    await openSummary(page, pet)
    await page.emulateMedia({ media: 'print' })
    const hidden = await page.evaluate(() => {
      const shown = (selector) => [...document.querySelectorAll(selector)].some((node) => getComputedStyle(node).display !== 'none' && node.getClientRects().length > 0)
      const cards = [...document.querySelectorAll('.vet-card')].map((node) => getComputedStyle(node))
      return {
        navigation: shown('.sidebar, .topbar, .mobile-nav'),
        buttons: shown('.vet-summary-actions button, .vet-summary-head'),
        printHead: shown('.vet-print-head'),
        shadows: cards.some((style) => style.boxShadow !== 'none'),
        cardBorders: cards.some((style) => style.borderTopWidth !== '0px'),
        tableHeaderGroup: [...document.querySelectorAll('.vet-table thead')].every((node) => getComputedStyle(node).display === 'table-header-group'),
        rowsKeepTogether: [...document.querySelectorAll('.vet-table tr')].every((node) => getComputedStyle(node).breakInside === 'avoid'),
        wideCells: [...document.querySelectorAll('.vet-summary td, .vet-summary p, .vet-summary dd')].filter((node) => node.scrollWidth > node.clientWidth + 1).length,
      }
    })
    result.checks.print[`${key} ${width}`] = hidden
    if (width === 1440) {
      await shot(page, `${key}-print-view`)
      await page.pdf({ path: resolve(here, `${key}.pdf`), preferCSSPageSize: true, printBackground: false })
    }
    await page.emulateMedia({ media: 'screen' })
  }
  await context.close()
}

// ---------- Widths: no page overflows sideways ----------
result.checks.overflowByWidth = {}
for (const width of [1440, 1150, 1024, 900, 768, 760, 390, 360, 320]) {
  const { context, page } = await signedInPage('owner-a@fixture.local', width)
  for (const [key, pet] of [['murka', murka], ['baron', baron]]) {
    await openSummary(page, pet)
    result.checks.overflowByWidth[`${key} ${width}`] = await overflow(page)
  }
  await context.close()
}

// ---------- Criterion 4: owner B opens neither the page nor its print view ----------
{
  const { context, page } = await signedInPage('owner-b@fixture.local', 1440)
  const requests = []
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/')) requests.push(request.url())
  })
  result.checks.foreign = {}
  for (const media of ['screen', 'print']) {
    await page.emulateMedia({ media })
    const response = await page.goto(summaryUrl(murka))
    await page.waitForLoadState('networkidle')
    const html = await page.content()
    result.checks.foreign[media] = {
      status: response.status(),
      h1: text(await page.textContent('h1').catch(() => '')),
      summaryShown: !!(await page.$('.vet-summary')),
      leaks: ['Курица', 'Хронический гастрит', 'Бравекто', 'Обострение гастрита', 'Медкарта: Мурка'].filter((word) => html.includes(word)),
    }
    if (media === 'screen') await shot(page, 'foreign-summary-1440')
    else await page.pdf({ path: resolve(here, 'foreign-print.pdf'), preferCSSPageSize: true })
  }
  result.checks.foreign.apiRequests = requests
  result.checks.foreign.api = {
    ownerBReadsA: (await api(`/pets/${murka.id}/health/summary`, tokenB)).status,
    signedOut: (await api(`/pets/${murka.id}/health/summary`)).status,
  }
  await context.close()
}

result.consoleErrors = consoleErrors
await browser.close()
console.log(JSON.stringify(result, null, 2))
