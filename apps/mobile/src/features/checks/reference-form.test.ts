import { describe, expect, it } from 'vitest'
import { checkPrefill } from '@/features/safety/to-check'
import { referenceHintShown, referencePetLine } from './reference-form'

describe('the check form opened from a «Можно ли?» card', () => {
  const handed = checkPrefill('Виноград и изюм', 'ru')

  it('says the description came from the reference only while it does', () => {
    expect(referenceHintShown(handed, handed)).toBe(true)
    // Refined after the card's words: still the reference's description.
    expect(referenceHintShown(handed, `${handed}Вырвало один раз.`)).toBe(true)
    // Trimmed by the person: the card's words are still there.
    expect(referenceHintShown(handed, handed.trim())).toBe(true)
  })

  it('says nothing for a form no card opened, or a description written over', () => {
    expect(referenceHintShown(null, 'Хромает второй день')).toBe(false)
    expect(referenceHintShown(null, '')).toBe(false)
    expect(referenceHintShown(handed, 'Хромает второй день')).toBe(false)
    expect(referenceHintShown(handed, '')).toBe(false)
    expect(referenceHintShown('', '')).toBe(false)
  })

  it('names the pet and its species under the title', () => {
    expect(referencePetLine('Рекс', 'Собака')).toBe('Рекс · собака')
  })
})
