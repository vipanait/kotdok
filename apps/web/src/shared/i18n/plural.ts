import { intlLocale, type Locale } from './config'

export interface PluralForms {
  one: string
  few: string
  many: string
  other: string
}

/**
 * Picks the form for `n` by the language's plural rules and puts the number
 * in, written the language's way: 1 проверка, 2 проверки, 5 проверок,
 * 4,5 года; 1 check, 2 checks, 4.5 years.
 */
export function formatCount(forms: PluralForms, n: number, locale: Locale): string {
  // The form follows the number as printed: 4.96 is written "5", so "5 лет".
  const rounded = Math.round(n * 10) / 10
  const category = new Intl.PluralRules(intlLocale(locale)).select(rounded)
  const template = category === 'one' || category === 'few' || category === 'many'
    ? forms[category]
    : forms.other
  const number = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(rounded)
  return template.replace('{n}', number)
}
