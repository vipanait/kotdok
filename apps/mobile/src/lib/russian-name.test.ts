import { describe, expect, it } from 'vitest'
import { nameCase } from './russian-name'

describe('a pet name in the case a sentence needs', () => {
  it('declines the common endings', () => {
    expect(nameCase('Мурка')).toEqual({ dative: 'Мурке', genitive: 'Мурки' })
    expect(nameCase('Луна')).toEqual({ dative: 'Луне', genitive: 'Луны' })
    expect(nameCase('Соня')).toEqual({ dative: 'Соне', genitive: 'Сони' })
    expect(nameCase('Мария')).toEqual({ dative: 'Марии', genitive: 'Марии' })
    expect(nameCase('Барсик')).toEqual({ dative: 'Барсику', genitive: 'Барсика' })
    expect(nameCase('Рекс')).toEqual({ dative: 'Рексу', genitive: 'Рекса' })
    expect(nameCase('Грей')).toEqual({ dative: 'Грею', genitive: 'Грея' })
  })

  it('leaves alone what it cannot decline for sure', () => {
    // A soft sign, a vowel other than а/я, Latin letters, several words: no guess.
    // Names that lose a vowel when declined (Пушок → Пушку, Лев → Льву) are not guessed either.
    for (const name of ['Рысь', 'Тоби', 'Пико', 'Max', 'Мистер Кот', '', 'Пушок', 'Снежок', 'Уголёк', 'Огонёк', 'Малец', 'Лев', 'Шарик-Пушок']) {
      expect(nameCase(name)).toBeNull()
    }
  })

  it('follows the case the name is written in', () => {
    expect(nameCase('МУРКА')).toEqual({ dative: 'МУРКЕ', genitive: 'МУРКИ' })
    expect(nameCase(' Мурка ')).toEqual({ dative: 'Мурке', genitive: 'Мурки' })
  })
})
