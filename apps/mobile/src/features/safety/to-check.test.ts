import { describe, expect, it } from 'vitest'
import { aiPrefillName, checkPrefill } from './to-check'

describe('the start of a symptom description', () => {
  it('says what was eaten, in the account language', () => {
    expect(checkPrefill('Виноград и изюм', 'ru')).toBe('Съел(а): виноград и изюм. ')
    expect(checkPrefill('Grapes', 'en')).toBe('Ate: grapes. ')
  })

  it('keeps an abbreviation as it is written', () => {
    expect(checkPrefill('NSAID gel', 'en')).toBe('Ate: NSAID gel. ')
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
    expect(checkPrefill(aiPrefillName('Нет данных', 'Таблетки от кашля'), 'ru')).toBe('Съел(а): таблетки от кашля. ')
  })
})
