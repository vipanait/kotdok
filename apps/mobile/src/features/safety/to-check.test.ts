import { describe, expect, it } from 'vitest'
import { checkPrefill } from './to-check'

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
