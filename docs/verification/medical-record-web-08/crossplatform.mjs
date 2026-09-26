/**
 * MW-08.2, the web side of web → phone → web (the phone side is driven in the
 * iOS Simulator by hand, see medical-record-web-08.md):
 *
 *   node crossplatform.mjs create   — owner A plans a rabies vaccination for
 *                                      the demo «Мурка» through the web form;
 *   node crossplatform.mjs check    — after the change on the phone, the web
 *                                      record view is reloaded and read.
 *
 * Same needs and local-only guards as verify.mjs. Prints JSON.
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
  readFileSync(resolve(root, 'apps/web/.env.integration'), 'utf8').split('\n').map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())).filter(Boolean).map((m) => [m[1], m[2]]),
)
if (!['127.0.0.1', 'localhost'].includes(new URL(env.TEST_SUPABASE_URL).hostname)) throw new Error('Local stack only')
const password = /FIXTURE_PASSWORD = '([^']+)'/.exec(readFileSync(resolve(root, 'apps/web/tests/integration/fixtures.ts'), 'utf8'))[1]
const tokenA = await fetch(`${env.TEST_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: env.TEST_SUPABASE_ANON_KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'owner-a@fixture.local', password }),
}).then((r) => r.json()).then((b) => b.access_token)
const api = (path) => fetch(`${SITE}/api/v1${path}`, { headers: { authorization: `Bearer ${tokenA}` } }).then((r) => r.json())
const murka = (await api('/pets')).find((pet) => pet.name === 'Мурка' && pet.notes === 'Демо медкарты (seed-medical-record-demo)')
const text = (value) => (value ?? '').replace(/\s+/g, ' ').trim()

const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow' })
const page = await context.newPage()
await page.goto(`${SITE}/login`)
await page.fill('input[type=email]', 'owner-a@fixture.local')
await page.fill('input[type=password]', password)
await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login')), page.press('input[type=password]', 'Enter')])

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date())
const plus = (days) => new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
const out = { murka: murka.id }

if (process.argv[2] === 'create') {
  await page.goto(`${SITE}/pets/${murka.id}/health/new?type=vaccination`)
  await page.waitForSelector('[role=combobox]')
  await page.waitForLoadState('networkidle')
  await page.focus('[role=combobox]')
  await page.fill('[role=combobox]', 'rabies')
  await page.waitForSelector('.catalog-option:has(strong:text-is("Нобивак Rabies"))')
  await page.click('.catalog-option:has(strong:text-is("Нобивак Rabies"))')
  await page.click('.event-status button:has-text("Запланировать")')
  await page.fill('.event-form input[type=date]', plus(20))
  await page.fill('.event-form input[id$="-clinic"]', 'Web clinic MW08')
  await page.click('body', { position: { x: 5, y: 5 } })
  await Promise.all([page.waitForURL(/\?saved=added/), page.click('.event-form button[type=submit]')])
  const plan = (await api(`/pets/${murka.id}/health`)).events.find((event) => event.clinic === 'Web clinic MW08')
  out.created = { id: plan.id, status: plan.status, date: plan.date, clinic: plan.clinic, items: plan.items.map((item) => item.name) }
  await page.goto(`${SITE}/pets/${murka.id}/health/${plan.id}`)
  await page.waitForSelector('main h1')
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: resolve(here, 'crossplatform-1-web-created.png'), fullPage: true })
} else {
  const plan = (await api(`/pets/${murka.id}/health`)).events.find((event) => event.items.some((item) => item.name === 'Нобивак Rabies') && (event.clinic ?? '').includes('MW08'))
  out.api = { id: plan?.id, status: plan?.status, date: plan?.date, clinic: plan?.clinic }
  await page.goto(`${SITE}/pets/${murka.id}/health/${plan.id}`)
  await page.waitForSelector('main h1')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)
  out.webView = text(await page.textContent('main'))
  await page.screenshot({ path: resolve(here, 'crossplatform-3-web-after-phone.png'), fullPage: true })
}
await browser.close()
console.log(JSON.stringify(out, null, 2))
