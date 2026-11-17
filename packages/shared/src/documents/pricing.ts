import type { SupportedLocale } from '../locale'

/**
 * «Распознать» and what it costs (spec «Кредиты»): a pet's first three
 * recognitions are free, then each costs a credit. The numbers always come
 * from the API (`GET /documents`: `free_recognitions_left`,
 * `recognition_price`; the balance from the cabinet) — never from here.
 */
export type RecognizeOffer =
  /** A free recognition; `left` counts this one. */
  | { kind: 'free'; left: number }
  /** Paid from the balance, which covers it. */
  | { kind: 'paid'; price: number; credits: number }
  /** No free ones left and the balance is short: the button is off, top-up is offered. */
  | { kind: 'short'; price: number; credits: number }

export function recognizeOffer(left: number, price: number, credits: number): RecognizeOffer {
  if (left > 0 && price === 0) return { kind: 'free', left }
  const cost = Math.max(price, 1)
  return credits >= cost ? { kind: 'paid', price: cost, credits } : { kind: 'short', price: cost, credits }
}

function plural(locale: SupportedLocale, n: number, forms: { one: string; few: string; many: string }): string {
  const rule = new Intl.PluralRules(locale).select(n)
  const form = rule === 'one' ? forms.one : rule === 'few' ? forms.few : forms.many
  return form.replace('{n}', String(n))
}

const CHECKS = {
  ru: { one: '{n} проверка', few: '{n} проверки', many: '{n} проверок' },
  en: { one: '{n} check', few: '{n} checks', many: '{n} checks' },
} as const

/**
 * The words on the button, and whether it is pressable: «Распознать —
 * бесплатно, осталось 2», «Распознать — 1 проверка». With neither a free
 * recognition nor the credits for one, the button is off.
 */
export function recognizeLabel(
  left: number,
  price: number,
  credits: number,
  locale: SupportedLocale,
): { text: string; disabled: boolean; offer: RecognizeOffer } {
  const offer = recognizeOffer(left, price, credits)
  if (offer.kind === 'free') {
    const text = locale === 'ru' ? `Распознать — бесплатно, осталось ${offer.left}` : `Recognise — free, ${offer.left} left`
    return { text, disabled: false, offer }
  }
  const cost = plural(locale, offer.price, CHECKS[locale])
  const text = locale === 'ru' ? `Распознать — ${cost}` : `Recognise — ${cost}`
  return { text, disabled: offer.kind === 'short', offer }
}

/** «4 проверки» / “4 checks”: the balance said in the app's words for credits. */
export function checksCount(n: number, locale: SupportedLocale): string {
  return plural(locale, n, CHECKS[locale])
}
