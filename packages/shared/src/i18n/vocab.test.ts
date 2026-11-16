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

  it('captions the «Можно ли» verdicts as the spec table does, for the app and the site alike', () => {
    expect(vocab.ru.safetyVerdict).toMatchObject({ can: 'Можно', nonToxic: 'Безопасно', caution: 'С осторожностью', lowRisk: 'Малый риск', cannot: 'Нельзя', dangerous: 'Опасно' })
    expect(vocab.en.safetyVerdict).toMatchObject({ can: 'Safe to eat', nonToxic: 'Non-toxic', lowRisk: 'Low risk', cannot: 'Not safe', dangerous: 'Dangerous' })
    expect(vocab.ru.safetyMedicineLine).toBe('Лекарства для людей не давайте питомцу без назначения врача')
    expect(vocab.en.safetyMedicineLine).toBe('Do not give human medicines to a pet unless a vet prescribes them')
  })

  it('keeps the «Можно ли» footnote short and the full text behind «О материалах» (handoff §8)', () => {
    expect(vocab.ru.safetyAbout.caption).toBe('Справочная информация. Не заменяет консультацию ветеринара.')
    expect(vocab.ru.safetyAbout.action).toBe('О материалах')
    expect(vocab.ru.safetyAbout.paragraphs).toEqual([
      'Тексты справочника подготовлены с помощью ИИ по ветеринарным источникам. Ветеринарный врач их не проверял и не подписывал.',
      'Источники указаны в карточках. Ответы, сгенерированные по вашему запросу, отдельно отмечены как «Ответ ИИ».',
      'Информация носит справочный характер и не заменяет консультацию ветеринара.',
    ])
    expect(vocab.en.safetyAbout.caption).toBe('For information only. Not a substitute for veterinary advice.')
    expect(vocab.en.safetyAbout.action).toBe('About this content')
    expect(vocab.en.safetyAbout.paragraphs).toHaveLength(3)
    expect(vocab.en.safetyAbout.paragraphs[0]).toMatch(/no vet has reviewed or signed/i)
    expect(vocab.en.safetyAbout.paragraphs[1]).toContain('“AI answer”')
    for (const language of ['ru', 'en'] as const) {
      expect(vocab[language].safetyAbout.title).toBeTruthy()
      expect(vocab[language].safetyAbout.close).toBeTruthy()
    }
  })
})
