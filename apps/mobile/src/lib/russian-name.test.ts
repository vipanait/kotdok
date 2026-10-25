import { describe, expect, it } from 'vitest'
import { nameCase } from './russian-name'

describe('a pet name in the case a sentence needs', () => {
  it('declines the common endings', () => {
    expect(nameCase('Мурка')).toEqual({ dative: 'Мурке', genitive: 'Мурки', accusative: 'Мурку' })
    expect(nameCase('Луна')).toEqual({ dative: 'Луне', genitive: 'Луны', accusative: 'Луну' })
    expect(nameCase('Соня')).toEqual({ dative: 'Соне', genitive: 'Сони', accusative: 'Соню' })
    expect(nameCase('Мария')).toEqual({ dative: 'Марии', genitive: 'Марии', accusative: 'Марию' })
    expect(nameCase('Барсик')).toEqual({ dative: 'Барсику', genitive: 'Барсика', accusative: 'Барсика' })
    expect(nameCase('Рекс')).toEqual({ dative: 'Рексу', genitive: 'Рекса', accusative: 'Рекса' })
    expect(nameCase('Грей')).toEqual({ dative: 'Грею', genitive: 'Грея', accusative: 'Грея' })
  })

  it('leaves alone what it cannot decline for sure', () => {
    // A soft sign, a vowel other than а/я, Latin letters, several words: no guess.
    // Names that lose a vowel when declined (Пушок → Пушку, Лев → Льву) are not guessed either.
    for (const name of ['Рысь', 'Тоби', 'Пико', 'Max', 'Мистер Кот', '', 'Пушок', 'Снежок', 'Уголёк', 'Огонёк', 'Малец', 'Лев', 'Шарик-Пушок']) {
      expect(nameCase(name)).toBeNull()
    }
  })

  it('follows the case the name is written in', () => {
    expect(nameCase('МУРКА')).toEqual({ dative: 'МУРКЕ', genitive: 'МУРКИ', accusative: 'МУРКУ' })
    expect(nameCase(' Мурка ')).toEqual({ dative: 'Мурке', genitive: 'Мурки', accusative: 'Мурку' })
  })
})
