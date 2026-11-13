/**
 * The first words of a symptom check opened from a «Можно ли?» card:
 * «Съел(а): виноград. » — the person goes on typing after it.
 */

import type { Locale } from '@lapka/contracts'

/** Lower case at the start of a sentence fragment, unless the first word is an abbreviation (NSAID). */
function inSentence(name: string): string {
  const first = name.split(' ')[0]
  if (first.length > 1 && first === first.toUpperCase()) return name
  return name.charAt(0).toLocaleLowerCase() + name.slice(1)
}

export function checkPrefill(itemName: string, locale: Locale): string {
  const name = itemName.trim()
  if (!name) return ''
  const what = inSentence(name)
  return locale === 'ru' ? `Съел(а): ${what}. ` : `Ate: ${what}. `
}
