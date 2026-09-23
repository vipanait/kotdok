import type { Locale } from './config'

export interface PluralForms {
  one: string
  few: string
  many: string
  other: string
}

/**
 * Picks the form for `n` by the language's plural rules and puts the number
 * in: 1 проверка, 2 проверки, 5 проверок; 1 check, 2 checks.
 */
export function formatCount(forms: PluralForms, n: number, locale: Locale): string {
  const category = new Intl.PluralRules(locale).select(n)
  const template = category === 'one' || category === 'few' || category === 'many'
    ? forms[category]
    : forms.other
  return template.replace('{n}', String(n))
}
