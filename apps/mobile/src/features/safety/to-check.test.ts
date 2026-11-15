import { describe, expect, it } from 'vitest'
import { en } from '@/i18n/en'
import { ru } from '@/i18n/ru'
import { aiPrefillName, checkPrefill } from './to-check'

describe('the start of a symptom description', () => {
  it('says what was eaten, in the account language', () => {
    expect(checkPrefill('Виноград и изюм', 'ru')).toBe('Питомец съел: виноград и изюм. ')
    expect(checkPrefill('Grapes', 'en')).toBe('Your pet ate: grapes. ')
  })

  it('keeps an abbreviation as it is written', () => {
    expect(checkPrefill('NSAID gel', 'en')).toBe('Your pet ate: NSAID gel. ')
  })

  it('is empty without a name', () => {
    expect(checkPrefill('  ', 'ru')).toBe('')
  })
})

describe('what an AI answer hands to the symptom check', () => {
  it('is the answer’s title', () => {
    expect(aiPrefillName('Питахайя', 'питахайя')).toBe('Питахайя')
  })

  it('is what the person typed when the title fell back to «No data»', () => {
    expect(aiPrefillName('Нет данных', 'таблетки от кашля')).toBe('таблетки от кашля')
    expect(aiPrefillName('No data', 'cough pills')).toBe('cough pills')
    expect(aiPrefillName(' нет данных ', 'x')).toBe('x')
    expect(checkPrefill(aiPrefillName('Нет данных', 'Таблетки от кашля'), 'ru')).toBe('Питомец съел: таблетки от кашля. ')
  })
})

describe('what the reference says about the check (owner, 2026-11-15)', () => {
  it('has no line about what a check costs: the form and the balance say it as always', () => {
    for (const t of [ru, en]) {
      expect(t.safety).not.toHaveProperty('checkCost')
      const lines = Object.values(t.safety).filter((value): value is string => typeof value === 'string')
      for (const line of lines) expect(line).not.toMatch(/кредит|расходует|спишется|credit/i)
    }
  })
})
