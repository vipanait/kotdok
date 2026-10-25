import { describe, expect, it } from 'vitest'
import { VACCINE_TARGETS } from '@lapka/contracts'
import { vocab } from './vocab'

/**
 * The words of the domain both apps say the same way — what a vaccination is
 * against, the parasite groups, the urgency levels, the months in the
 * genitive — kept once instead of in four dictionaries.
 */
describe('shared vocabulary', () => {
  it('names every vaccination target of the contract, in both languages', () => {
    for (const language of ['ru', 'en'] as const) {
      expect(Object.keys(vocab[language].targets).sort()).toEqual(VACCINE_TARGETS.map((target) => target.code).sort())
      expect(Object.keys(vocab[language].against).sort()).toEqual(VACCINE_TARGETS.map((target) => target.code).sort())
    }
  })

  it('says what a vaccination is against as the middle of a sentence', () => {
    expect(vocab.ru.against.rabies).toBe('от бешенства')
    expect(vocab.en.against.rabies).toBe('rabies')
    expect(vocab.ru.parasiteGroupsOf.fleas).toBe('блох')
    expect(vocab.en.parasiteGroupsOf.fleas).toBe('flea')
  })

  it('has twelve months and five urgency levels', () => {
    expect(vocab.ru.months).toHaveLength(12)
    expect(vocab.en.months[8]).toBe('September')
    expect(vocab.ru.months[8]).toBe('сентября')
    expect(Object.keys(vocab.ru.urgency)).toEqual(['emergency', 'urgent', 'monitor', 'home_care', 'healthy'])
    expect(vocab.en.urgency.healthy.label).toBe('ALL GOOD')
  })
})
