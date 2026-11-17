import { describe, expect, it } from 'vitest'
import { checksCount, recognizeLabel } from './pricing'

describe('recognizeLabel', () => {
  it('free with 2 left', () => {
    expect(recognizeLabel(2, 0, 0, 'ru')).toMatchObject({ text: 'Распознать — бесплатно, осталось 2', disabled: false })
    expect(recognizeLabel(2, 0, 0, 'en').text).toBe('Recognise — free, 2 left')
  })

  it('one check when none left', () => {
    expect(recognizeLabel(0, 1, 4, 'ru')).toMatchObject({ text: 'Распознать — 1 проверка', disabled: false, offer: { kind: 'paid' } })
    expect(recognizeLabel(0, 1, 4, 'en').text).toBe('Recognise — 1 check')
  })

  it('disabled with no credits and none left', () => {
    expect(recognizeLabel(0, 1, 0, 'ru')).toMatchObject({ disabled: true, offer: { kind: 'short', price: 1, credits: 0 } })
  })

  it('a price from the API is used as given', () => {
    expect(recognizeLabel(0, 2, 5, 'ru').text).toBe('Распознать — 2 проверки')
  })
})

describe('checksCount', () => {
  it('says the balance in Russian plural forms', () => {
    expect([1, 3, 5, 21].map((n) => checksCount(n, 'ru'))).toEqual(['1 проверка', '3 проверки', '5 проверок', '21 проверка'])
  })
})
