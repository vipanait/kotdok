import { describe, expect, it } from 'vitest'
import { checkPrefill } from '@/features/safety/to-check'
import { keepHandedOver, referenceHintShown, referenceMode, referencePetLine } from './reference-form'

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

  it('is drawn plainly only while the card\'s words are in the description', () => {
    expect(referenceMode(handed, handed, false)).toBe(true)
    expect(referenceMode(handed, `${handed}Вырвало.`, false)).toBe(true)
    // Erased: the ordinary form, with the step counter and the pet picker, comes back.
    expect(referenceMode(handed, '', false)).toBe(false)
    expect(referenceMode(handed, 'Хромает', false)).toBe(false)
    // Never handed over: always the ordinary form.
    expect(referenceMode(null, handed, false)).toBe(false)
  })

  it('forgets the hand-over once its words are gone, so writing them back does not bring the plain form back', () => {
    expect(keepHandedOver(handed, `${handed}рвота`)).toBe(handed)
    expect(keepHandedOver(handed, 'Питомец')).toBeNull()
    expect(keepHandedOver(null, handed)).toBeNull()
    const erased = keepHandedOver(handed, '')
    expect(referenceMode(erased, handed, false)).toBe(false)
  })

  it('draws a re-check opened after a hand-over as the ordinary form', () => {
    expect(referenceMode(handed, handed, true)).toBe(false)
  })
})
