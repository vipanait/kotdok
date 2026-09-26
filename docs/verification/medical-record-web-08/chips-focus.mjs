/**
 * MW-08 fix round 1: the vaccination form's «От чего» group gets a visible
 * focus ring when a keyboard save sends focus to it, and none after a mouse
 * save. Local site only; argument — the demo «Мурка» id.
 *
 *   PLAYWRIGHT=… CHROME=… node docs/verification/medical-record-web-08/chips-focus.mjs <petId>
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT)
const password = /FIXTURE_PASSWORD = '([^']+)'/.exec(readFileSync(new URL('../../../apps/web/tests/integration/fixtures.ts', import.meta.url), 'utf8'))[1]
const SITE = 'http://localhost:3100'
const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ru-RU' })
const page = await context.newPage()
await page.goto(`${SITE}/login`)
await page.fill('input[type=email]', 'owner-a@fixture.local')
await page.fill('input[type=password]', password)
await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login')), page.press('input[type=password]', 'Enter')])
await page.goto(`${SITE}/pets/${process.argv[2]}/health/new?type=vaccination`)
await page.waitForSelector('[role=combobox]'); await page.waitForLoadState('networkidle')
// Own name, no disease chosen, saved from the keyboard: the form sends focus to the group.
await page.focus('[role=combobox]')
await page.waitForSelector('.catalog-option:has-text("Без препарата")')
await page.click('.catalog-option:has-text("Без препарата")')
await page.click('body', { position: { x: 5, y: 5 } })
await page.waitForTimeout(300)
// Only the save button may take the Enter: on a chip it would pick a disease and save a record.
await page.locator('.event-form button[type=submit]').focus()
const onSave = await page.evaluate(() => document.activeElement?.matches('.event-form button[type=submit]'))
if (!onSave) throw new Error('focus is not on «Сохранить»; nothing pressed')
await page.keyboard.press('Enter')
await page.waitForTimeout(500)
const res = await page.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return { cls: e.className, role: e.getAttribute('role'), outline: s.outlineStyle + ' ' + s.outlineWidth, fv: e.matches(':focus-visible') } })
console.log('keyboard save →', JSON.stringify(res))
await page.screenshot({ path: new URL('chips-focus-visible-1440.png', import.meta.url).pathname, clip: { x: 0, y: 0, width: 1440, height: 1000 } })
if (!res.fv || res.cls !== 'chips') throw new Error('the save did not stop at «От чего»')
await page.click('.event-form button[type=submit]')
await page.waitForTimeout(500)
const res2 = await page.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return { cls: e.className, outline: s.outlineStyle, fv: e.matches(':focus-visible') } })
console.log('mouse save →', JSON.stringify(res2))
await browser.close()
