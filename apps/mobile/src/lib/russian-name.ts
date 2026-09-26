/**
 * A pet's name in the dative and genitive, for «Мурке через 3 дня» and
 * «Сегодня у Мурки».
 *
 * Only endings whose forms are certain are declined: -а, -я, -й and a hard
 * consonant (taken as a masculine name, which pet names ending so almost
 * always are), except where a vowel drops (Пушок, Малец, Лев). Anything
 * else — a soft sign, which may be either gender, other vowels, Latin
 * letters, several words — returns null, and the caller uses a sentence that
 * needs no case. A wrong ending on someone's pet reads worse than a plain
 * sentence.
 */
export function nameCase(raw: string): { dative: string; genitive: string } | null {
  const name = raw.trim()
  if (!/^[А-ЯЁа-яё-]{2,}$/.test(name)) return null

  const last = name.slice(-1)
  const lower = last.toLowerCase()
  const upper = last !== lower
  const ending = (text: string) => (upper ? text.toUpperCase() : text)
  const stem = name.slice(0, -1)
  const beforeLast = stem.slice(-1).toLowerCase()

  if (lower === 'а') {
    return { dative: stem + ending('е'), genitive: stem + ending('гкхжчшщ'.includes(beforeLast) ? 'и' : 'ы') }
  }
  if (lower === 'я') {
    const form = beforeLast === 'и' ? 'и' : 'е'
    return { dative: stem + ending(form), genitive: stem + ending('и') }
  }
  if (lower === 'й') return { dative: stem + ending('ю'), genitive: stem + ending('я') }
  // A vowel that drops when declined — Пушок → Пушку, Малец → Мальцу, Лев → Льву — is not guessed.
  if (/(ок|ёк|ек|ец)$/i.test(name) || name.toLowerCase() === 'лев') return null
  if ('бвгджзклмнпрстфхцчшщ'.includes(lower)) {
    return { dative: name + ending('у'), genitive: name + ending('а') }
  }
  return null
}
