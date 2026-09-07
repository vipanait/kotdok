/**
 * Russian plural forms.
 *
 * Three forms, chosen by the last digit with an exception for the teens — a
 * rule that is easy to write from memory and easy to get wrong, which is why
 * it lives here with tests rather than inline in a screen. "1 проверок" reads
 * as a bug to anyone who speaks the language.
 */
export function plural(count: number, one: string, few: string, many: string): string {
  const absolute = Math.abs(Math.trunc(count))
  const tens = absolute % 100
  if (tens >= 11 && tens <= 14) return many

  switch (absolute % 10) {
    case 1:
      return one
    case 2:
    case 3:
    case 4:
      return few
    default:
      return many
  }
}

/** "проверка / проверки / проверок" — the balance shown on the profile. */
export const checksWord = (count: number) => plural(count, 'проверка', 'проверки', 'проверок')
