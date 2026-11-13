import { describe, expect, it } from 'vitest'
import { aiWordingProblems, guardAiAnswer } from '@/server/safety/ask-safety'
import { SAFETY_AVOID, SAFETY_DANGER_STANDARD, SAFETY_FIRST_STEPS, SAFETY_NO_DATA } from '@/server/safety/ask-language'
import { safetyWordingProblems } from '@/features/safety/schema'

/**
 * SAFE-03: what the server does to a model's answer before anyone sees it.
 * A wrong «safe» is the harm the feature exists to prevent, so every rule
 * that can only make an answer stricter is checked here with exact values.
 */

/** A well-formed answer about a food, to break one field at a time. */
function raw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    recognized: true,
    category: 'food',
    canonical_name_ru: 'Питахайя',
    canonical_name_en: 'Dragon fruit',
    verdict: 'caution',
    title: 'Питахайя',
    summary: 'Небольшой кусочек мякоти обычно не вредит.',
    why: 'Много сахара и клетчатки; кожура жёсткая.',
    signs: ['понос'],
    if_eaten: 'watch',
    ...overrides,
  }
}

const ru: { grounded: boolean; locale: 'ru' | 'en'; query?: string; cached?: boolean } = { grounded: true, locale: 'ru', query: 'питахайя' }

function guarded(input: unknown, ctx = ru) {
  const result = guardAiAnswer(input, ctx)
  if (!('verdict' in result)) throw new Error(`expected a recognized answer, got ${JSON.stringify(result)}`)
  return result
}

describe('guardAiAnswer', () => {
  it('turns «safe» without a knowledge-base fragment above the threshold into «unknown»', () => {
    const answer = guarded(raw({ verdict: 'safe', if_eaten: 'none' }), { grounded: false, locale: 'ru' })
    expect(answer.verdict).toBe('unknown')
    expect(answer.if_eaten).toBe('watch')
  })

  it('keeps «safe» when a fragment backs it', () => {
    const answer = guarded(raw({ verdict: 'safe', if_eaten: 'watch' }))
    expect(answer.verdict).toBe('safe')
    expect(answer.if_eaten).toBe('none')
  })

  it('makes any medicine «danger», call now', () => {
    const answer = guarded(raw({ category: 'medicine', verdict: 'caution', if_eaten: 'watch' }))
    expect(answer.verdict).toBe('danger')
    expect(answer.if_eaten).toBe('call_now')
  })

  it('never lets a household substance be «safe», even grounded', () => {
    const answer = guarded(raw({ category: 'household', verdict: 'safe', if_eaten: 'none' }))
    expect(answer.verdict).toBe('unknown')
    expect(answer.if_eaten).toBe('watch')
  })

  it('makes «danger» call now whatever the model said', () => {
    expect(guarded(raw({ verdict: 'danger', if_eaten: 'none' })).if_eaten).toBe('call_now')
  })

  it('never leaves «caution» with nothing to do', () => {
    expect(guarded(raw({ verdict: 'caution', if_eaten: 'none' })).if_eaten).toBe('watch')
    expect(guarded(raw({ verdict: 'caution', if_eaten: 'call_now' })).if_eaten).toBe('call_now')
  })

  it('replaces an answer with a forbidden word by «unknown» and the standard text', () => {
    const answer = guarded(raw({ verdict: 'safe', summary: 'Дозировка 5 мг/кг', signs: ['вялость'] }))
    expect(answer.verdict).toBe('unknown')
    expect(answer.summary).toBe(SAFETY_NO_DATA.ru.summary)
    expect(answer.why).toBe(SAFETY_NO_DATA.ru.why)
    // A clean sign stays: only lines that trip the list are dropped.
    expect(answer.signs).toEqual(['вялость'])
    expect(JSON.stringify(answer)).not.toMatch(/мг|дозир/i)
  })

  it('checks English answers against the English words', () => {
    const answer = guarded(raw({ title: 'Dragon fruit', summary: 'Typical dosage is low.' }), { grounded: true, locale: 'en' })
    expect(answer.verdict).toBe('unknown')
    expect(answer.summary).toBe(SAFETY_NO_DATA.en.summary)
  })

  it('treats «make it vomit» without «only if a vet says so» as forbidden', () => {
    const answer = guarded(raw({ why: 'Вызовите рвоту солёной водой.' }))
    expect(answer.verdict).toBe('unknown')
    expect(JSON.stringify(answer)).not.toMatch(/солён/)
  })

  it('stays strict on vomiting in a model’s text: a sign worded with «вызвать рвоту» is replaced too', () => {
    // The reference allows «может вызвать рвоту» as a sign; a model's text is not reviewed by hand.
    expect(guarded(raw({ why: 'Может вызвать рвоту и понос.' })).verdict).toBe('unknown')
    expect(guarded(raw({ why: 'Chocolate can make a dog vomit.' }), { grounded: true, locale: 'en' }).verdict).toBe('unknown')
  })

  it.each([
    'Дайте перекись водорода, чтобы её стошнило.',
    'Дайте активированный уголь.',
    'Безопасная доза 10 мг на килограмм.',
    'Дайте 1 таблетку.',
    'Можно дать рвотное средство.',
    'Give 5 mg.',
    'A dose of 2 tablets is enough.',
    'Induce emesis at home.',
    'Hydrogen peroxide helps.',
    'Можно давать активированный уголь.',
    'Помогает дать немного угля.',
    'Give activated charcoal.',
    'One tablet is fine.',
    'A pill of it helps.',
    'Administer it twice.',
  ])('replaces an answer that reads like treatment: %s', summary => {
    for (const locale of ['ru', 'en'] as const) {
      const answer = guarded(raw({ summary }), { grounded: true, locale })
      expect(answer.verdict, locale).toBe('unknown')
      expect(answer.summary, locale).toBe(SAFETY_NO_DATA[locale].summary)
      expect(answer.why, locale).toBe(SAFETY_NO_DATA[locale].why)
      expect(answer.signs, locale).toEqual(['понос'])
    }
  })

  it.each([
    'Не дайте питомцу доесть остатки.',
    'Никогда не дайте это котёнку.',
    'Не давайте это питомцу.',
    'Do not give it to your dog.',
    "Don't give it to your cat.",
    'Don’t give it to your cat.',
    'Never give grapes to a dog.',
    'Признаки появляются мгновенно.',
    'Given the sugar, keep it rare.',
    'Не давать сырым.',
    'Нельзя давать это собаке.',
    'Never give it raw.',
    'Углеводов в мякоти много.',
  ])('keeps advice against and ordinary words: %s', summary => {
    expect(guarded(raw({ summary })).summary).toBe(summary)
  })

  it('still checks what follows a negation', () => {
    expect(guarded(raw({ summary: 'Не дайте больше 5 мг.' })).verdict).toBe('unknown')
    expect(guarded(raw({ summary: 'Do not give more than one dose.' })).verdict).toBe('unknown')
  })

  it('checks both languages whatever the account’s language', () => {
    // A Russian account answered in English.
    const answer = guarded(raw({ summary: 'Dosage 5 mg/kg is fine.' }), { grounded: true, locale: 'ru' })
    expect(answer.verdict).toBe('unknown')
    expect(answer.summary).toBe(SAFETY_NO_DATA.ru.summary)
    expect(guarded(raw({ why: 'Make your dog vomit at once.' }), { grounded: true, locale: 'ru' }).verdict).toBe('unknown')
    expect(guarded(raw({ why: 'Вызовите рвоту.' }), { grounded: true, locale: 'en' }).verdict).toBe('unknown')
  })

  it('keeps a medicine «danger» when its text is replaced, with the danger text', () => {
    const answer = guarded(raw({ category: 'medicine', verdict: 'danger', summary: 'Дозировка 5 мг/кг' }))
    expect(answer.verdict).toBe('danger')
    expect(answer.if_eaten).toBe('call_now')
    expect(answer.summary).toBe(SAFETY_DANGER_STANDARD.ru.summary)
    expect(answer.why).toBe(SAFETY_DANGER_STANDARD.ru.why)
  })

  describe('a wording replacement never softens the verdict', () => {
    it('keeps a food «danger» call-now, drops only the sign that trips and keeps the rest', () => {
      const answer = guarded(
        raw({ verdict: 'danger', if_eaten: 'call_now', signs: ['рвотные позывы', 'вялость', 'дрожь'], summary: 'Опасно для собак.' }),
      )
      expect(answer.verdict).toBe('danger')
      expect(answer.if_eaten).toBe('call_now')
      expect(answer.signs).toEqual(['вялость', 'дрожь'])
      expect(answer.summary).toBe(SAFETY_DANGER_STANDARD.ru.summary)
    })

    it('keeps «call now» when «caution» becomes «unknown»', () => {
      const answer = guarded(raw({ verdict: 'caution', if_eaten: 'call_now', why: 'Безопасная доза мала.' }))
      expect(answer.verdict).toBe('unknown')
      expect(answer.if_eaten).toBe('call_now')
      expect(answer.summary).toBe(SAFETY_NO_DATA.ru.summary)
    })

    it('turns a grounded «safe» into «unknown», watch', () => {
      const answer = guarded(raw({ verdict: 'safe', if_eaten: 'none', summary: 'Можно давать понемногу.' }))
      expect(answer.verdict).toBe('unknown')
      expect(answer.if_eaten).toBe('watch')
    })

    it('keeps a Russian account’s «danger» answered with an English dose', () => {
      const answer = guarded(raw({ verdict: 'danger', summary: 'A toxic dose is 1 g per kg.' }))
      expect(answer.verdict).toBe('danger')
      expect(answer.if_eaten).toBe('call_now')
      expect(answer.summary).toBe(SAFETY_DANGER_STANDARD.ru.summary)
    })

    it('falls back to the query for a title that trips, and to «No data» when that trips too', () => {
      expect(guarded(raw({ title: 'Таблетки от кашля' })).title).toBe('Питахайя')
      expect(guarded(raw({ title: 'Таблетки' }), { grounded: true, locale: 'ru', query: 'таблетки' }).title).toBe(
        SAFETY_NO_DATA.ru.title,
      )
    })
  })

  describe('text and verdict always agree (after SAFE-04)', () => {
    it('replaces the model’s text when an ungrounded «safe» becomes «unknown»', () => {
      const answer = guarded(raw({ verdict: 'safe', if_eaten: 'none', summary: 'Use caution: a little is fine.' }), {
        grounded: false,
        locale: 'en',
      })
      expect(answer.verdict).toBe('unknown')
      expect(answer.summary).toBe(SAFETY_NO_DATA.en.summary)
      expect(answer.why).toBe(SAFETY_NO_DATA.en.why)
      // Signs and title are the model's, filtered as usual.
      expect(answer.signs).toEqual(['понос'])
      expect(answer.title).toBe('Питахайя')
    })

    it('gives a household «safe» the no-data text', () => {
      const answer = guarded(raw({ category: 'household', verdict: 'safe', if_eaten: 'none' }))
      expect(answer).toMatchObject({ verdict: 'unknown', summary: SAFETY_NO_DATA.ru.summary, why: SAFETY_NO_DATA.ru.why })
    })

    it('gives a medicine the model called «caution» the danger text', () => {
      const answer = guarded(raw({ category: 'medicine', verdict: 'caution' }))
      expect(answer).toMatchObject({
        verdict: 'danger',
        if_eaten: 'call_now',
        summary: SAFETY_DANGER_STANDARD.ru.summary,
        why: SAFETY_DANGER_STANDARD.ru.why,
      })
    })

    it('keeps the model’s text when the verdict is its own and the text is clean', () => {
      const answer = guarded(raw())
      expect(answer).toMatchObject({ verdict: 'caution', summary: raw().summary, why: raw().why, signs: ['понос'] })
      const danger = guarded(raw({ category: 'medicine', verdict: 'danger', summary: 'Токсичен для собак.' }))
      expect(danger.summary).toBe('Токсичен для собак.')
    })

    it.each([
      ['Судя по базе знаний, мякоть не ядовита.', 'ru'],
      ['В контексте выше нет сведений.', 'ru'],
      ['По контексту это допустимо.', 'ru'],
      ['Предоставленный фрагмент говорит, что опасно.', 'ru'],
      ['The provided knowledge base says it is mild.', 'en'],
      ['Based on the provided context, it is mild.', 'en'],
      ['The context provided does not mention it.', 'en'],
      ['According to the context, it is mild.', 'en'],
      ['The provided fragments note mild upset.', 'en'],
    ] as const)('never shows the model talking about its context: %s', (summary, locale) => {
      const danger = guarded(raw({ verdict: 'danger', summary }), { grounded: true, locale })
      expect(danger).toMatchObject({ verdict: 'danger', if_eaten: 'call_now', summary: SAFETY_DANGER_STANDARD[locale].summary })
      const unknown = guarded(raw({ verdict: 'unknown', why: summary }), { grounded: true, locale })
      expect(unknown).toMatchObject({ verdict: 'unknown', summary: SAFETY_NO_DATA[locale].summary, why: SAFETY_NO_DATA[locale].why })
    })

    it('makes a «caution» that talks about its context «unknown», with the no-data text', () => {
      // Dropping the sentence would drop its caveat with it: «bones are not allowed» would vanish.
      const answer = guarded(raw({ summary: 'Кусочек обычно не вредит. По базе знаний, косточки давать нельзя.' }))
      expect(answer).toMatchObject({ verdict: 'unknown', summary: SAFETY_NO_DATA.ru.summary, why: SAFETY_NO_DATA.ru.why })
      const safe = guarded(raw({ verdict: 'safe', if_eaten: 'none', why: 'Based on the provided context, it is fine.' }), {
        grounded: true,
        locale: 'en',
      })
      expect(safe).toMatchObject({ verdict: 'unknown', summary: SAFETY_NO_DATA.en.summary })
    })

    it.each([
      'Raw bones are usually fine. Cooked bones can splinter into sharp fragments.',
      'Fine in the context of a balanced meal.',
      'Варёные кости дают острые фрагменты кости.',
      'В контексте обычного рациона это редкость.',
    ])('leaves ordinary words alone: %s', summary => {
      expect(guarded(raw({ summary }))).toMatchObject({ verdict: 'caution', summary })
    })

    it('drops a sign or a title that talks about the context', () => {
      const answer = guarded(raw({ signs: ['вялость', 'по контексту не ясно'], title: 'Питахайя (из контекста)' }))
      expect(answer.signs).toEqual(['вялость'])
      expect(answer.title).toBe('Питахайя')
      expect(answer.verdict).toBe('caution')
    })

    it('treats a cached answer the guard lowered, saved before this rule, as changed', () => {
      // As cached before: the model said «caution», a guard lowered it, the text stayed.
      const stored = { ...raw({ verdict: 'unknown', summary: 'Use caution: a little is fine.' }), if_eaten: 'watch' }
      const answer = guarded(stored, { grounded: true, locale: 'en', cached: true })
      expect(answer).toMatchObject({ verdict: 'unknown', summary: SAFETY_NO_DATA.en.summary })

      // Saved after it, with the model's verdict recorded: a model's own «unknown» keeps its text.
      const own = guarded({ ...raw({ verdict: 'unknown' }), model_verdict: 'unknown' }, { grounded: true, locale: 'ru', cached: true })
      expect(own.summary).toBe(raw().summary)
      const lowered = guarded({ ...raw({ verdict: 'unknown' }), model_verdict: 'safe' }, { grounded: true, locale: 'ru', cached: true })
      expect(lowered.summary).toBe(SAFETY_NO_DATA.ru.summary)
    })

    it('ignores a `model_verdict` in a fresh model answer', () => {
      // Only the cache records it; a model cannot claim a verdict it did not give to keep its text.
      const answer = guarded({ ...raw({ category: 'medicine', verdict: 'caution', summary: 'Небольшая доля безвредна.' }), model_verdict: 'danger' })
      expect(answer).toMatchObject({ verdict: 'danger', summary: SAFETY_DANGER_STANDARD.ru.summary, model_verdict: 'caution' })
    })

    it('records the model’s own verdict for the cache', () => {
      expect(guarded(raw({ category: 'medicine', verdict: 'caution' })).model_verdict).toBe('caution')
      expect(guarded(raw()).model_verdict).toBe('caution')
    })
  })

  it('answers «not recognized» when the model did not recognize an item', () => {
    expect(guardAiAnswer(raw({ recognized: false }), ru)).toEqual({ recognized: false })
    // Without the other fields too: a refusal need not be a full answer.
    expect(guardAiAnswer({ recognized: false }, ru)).toEqual({ recognized: false })
    expect(guardAiAnswer(raw({ recognized: 'yes' }), ru)).toEqual({ recognized: false })
  })

  it('throws on a verdict or a category outside the four, an empty title or summary, or not an object', () => {
    expect(() => guardAiAnswer(raw({ verdict: 'ok' }), ru)).toThrow()
    expect(() => guardAiAnswer(raw({ category: 'toy' }), ru)).toThrow()
    expect(() => guardAiAnswer(raw({ title: '  ' }), ru)).toThrow()
    expect(() => guardAiAnswer(raw({ summary: '' }), ru)).toThrow()
    expect(() => guardAiAnswer('safe', ru)).toThrow()
    expect(() => guardAiAnswer(null, ru)).toThrow()
  })

  it('keeps at most eight signs of at most 200 characters, and a title of at most 80', () => {
    const answer = guarded(
      raw({
        verdict: 'danger',
        signs: [...Array.from({ length: 11 }, (_, i) => `признак ${i + 1}`), 'я'.repeat(300)],
        title: 'т'.repeat(120),
      }),
    )
    expect(answer.signs).toHaveLength(8)
    expect(answer.signs[0]).toBe('признак 1')
    expect(answer.title).toHaveLength(80)

    const long = guarded(raw({ signs: ['я'.repeat(300)] }))
    expect(long.signs[0]).toHaveLength(200)
  })

  it('drops signs that are not text', () => {
    expect(guarded(raw({ signs: ['рвота', 3, null, ''] })).signs).toEqual(['рвота'])
    expect(guarded(raw({ signs: 'рвота' })).signs).toEqual([])
  })
})

describe('the fixed texts of an AI answer', () => {
  it('pass the reference’s wording checks in both languages', () => {
    for (const locale of ['ru', 'en'] as const) {
      const texts = [
        ...SAFETY_FIRST_STEPS[locale],
        ...SAFETY_AVOID[locale],
        ...Object.values(SAFETY_NO_DATA[locale]),
        ...Object.values(SAFETY_DANGER_STANDARD[locale]),
      ]
      expect(safetyWordingProblems(texts, locale), locale).toEqual([])
      // And the stricter rules a model's text gets — except the «avoid» list, whose job is to name
      // the remedies (charcoal, milk, oil) the owner must not give.
      const shown = [...SAFETY_FIRST_STEPS[locale], ...Object.values(SAFETY_NO_DATA[locale]), ...Object.values(SAFETY_DANGER_STANDARD[locale])]
      expect(aiWordingProblems(shown), locale).toEqual([])
      expect(SAFETY_FIRST_STEPS[locale].length).toBeGreaterThanOrEqual(3)
      expect(SAFETY_AVOID[locale].length).toBeGreaterThanOrEqual(1)
    }
  })

  it('mention vomiting only as «not unless a vet says so»', () => {
    expect(SAFETY_AVOID.ru.join(' ')).toMatch(/только\s+по\s+указанию\s+врача/)
    expect(SAFETY_AVOID.en.join(' ')).toMatch(/unless\s+a\s+vet\s+tells\s+you\s+to/i)
  })
})
