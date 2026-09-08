import { describe, expect, it } from 'vitest'
import { URGENCY_LEVELS } from '@lapka/contracts'
import { SUPPORTED_LOCALES } from '@lapka/shared'
import { en } from './en'
import { ru } from './ru'

const DICTIONARIES = { ru, en }

/** Every leaf of the dictionary, as a path and a value. */
function leaves(value: unknown, path = ''): [string, unknown][] {
  if (typeof value !== 'object' || value === null) return [[path, value]]
  return Object.entries(value).flatMap(([key, child]) =>
    leaves(child, path ? `${path}.${key}` : key),
  )
}

describe('the two languages', () => {
  it('have exactly the same keys', () => {
    // The type already forces this; the test says so in a way that survives a
    // future where the dictionaries are loaded rather than imported.
    expect(leaves(en).map(([path]) => path)).toEqual(leaves(ru).map(([path]) => path))
  })

  it('leave nothing empty', () => {
    for (const [locale, dict] of Object.entries(DICTIONARIES)) {
      for (const [path, value] of leaves(dict)) {
        if (typeof value === 'function') continue
        expect(value, `${locale}.${path}`).toBeTruthy()
      }
    }
  })

  it('are not the same words twice', () => {
    // A key left as the Russian string in the English file would compile, look
    // finished, and read as a bug to the person in front of it.
    const shared = leaves(ru).filter(([path, value]) => {
      if (typeof value !== 'string') return false
      const other = leaves(en).find(([p]) => p === path)?.[1]
      return other === value
    })

    // One string is genuinely the same in both languages: the example address.
    expect(shared.map(([path]) => path)).toEqual(['auth.emailPlaceholder'])
  })
})

describe('urgency in both languages', () => {
  it('covers all five levels, with a word and an action', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const level of URGENCY_LEVELS) {
        const { label, action } = DICTIONARIES[locale].urgency[level]
        expect(label, `${locale}/${level}`).toBeTruthy()
        expect(action, `${locale}/${level}`).toBeTruthy()
      }
    }
  })

  it('never says the same thing for two different levels', () => {
    // The level is the answer. Two levels that read alike would leave someone
    // deciding whether to drive to a clinic tonight with nothing to go on.
    for (const locale of SUPPORTED_LOCALES) {
      const labels = URGENCY_LEVELS.map((level) => DICTIONARIES[locale].urgency[level].label)
      const actions = URGENCY_LEVELS.map((level) => DICTIONARIES[locale].urgency[level].action)

      expect(new Set(labels).size, `${locale} labels`).toBe(URGENCY_LEVELS.length)
      expect(new Set(actions).size, `${locale} actions`).toBe(URGENCY_LEVELS.length)
    }
  })

  it('says the level in words, not only in colour', () => {
    // Someone who cannot tell the red card from the amber one still has to
    // learn whether this is tonight or in a week.
    for (const locale of SUPPORTED_LOCALES) {
      for (const level of URGENCY_LEVELS) {
        const { action } = DICTIONARIES[locale].urgency[level]
        expect(action.length, `${locale}/${level}`).toBeGreaterThan(8)
      }
    }
  })

  it('keeps the note about what this tool is not', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(DICTIONARIES[locale].result.disclaimer.length, locale).toBeGreaterThan(30)
    }
  })
})
