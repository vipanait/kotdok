import { describe, expect, it } from 'vitest'
import { SUPPORTED_LOCALES } from '@lapka/shared'
import { DISCLAIMER, REASSURANCE, outputFormat } from './analysis-language'

describe('the language the analysis answers in', () => {
  it('names the language it wants, for every locale the product offers', () => {
    expect(outputFormat('ru')).toContain('must be in Russian')
    expect(outputFormat('en')).toContain('must be in English')

    for (const locale of SUPPORTED_LOCALES) {
      expect(DISCLAIMER[locale], locale).toBeTruthy()
      expect(REASSURANCE[locale], locale).toBeTruthy()
    }
  })

  it('does not leave Russian examples in the English skeleton', () => {
    // The instruction alone does not hold: a skeleton full of Russian
    // placeholders pulls the answer back to Russian regardless of wording.
    expect(outputFormat('en')).not.toMatch(/[А-Яа-яЁё]/)
  })

  it('keeps the Russian skeleton Russian', () => {
    expect(outputFormat('ru')).toMatch(/[А-Яа-яЁё]/)
  })

  it('keeps the shape the parser expects, whatever the language', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const format = outputFormat(locale)
      for (const key of [
        'urgency',
        'urgency_reason',
        'photo_observations',
        'possible_causes',
        'species_specific_warning',
        'additional_pet_info_needed',
        'home_care_steps',
        'vet_questions',
        'disclaimer',
      ]) {
        expect(format, `${locale}/${key}`).toContain(`"${key}"`)
      }
      // The five levels are the contract with the client; a language must not
      // quietly drop or rename one.
      expect(format, locale).toContain('"emergency|urgent|monitor|home_care|healthy"')
      expect(format, locale).toContain('{context}')
    }
  })

  it('carries the disclaimer into the skeleton, so the model echoes it back', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(outputFormat(locale), locale).toContain(DISCLAIMER[locale])
    }
  })
})
