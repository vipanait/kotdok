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
  const category = new Intl.PluralRules(intlLocale(locale)).select(n)
  const template = category === 'one' || category === 'few' || category === 'many'
    ? forms[category]
    : forms.other
  const number = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(n)
  return template.replace('{n}', number)
}
