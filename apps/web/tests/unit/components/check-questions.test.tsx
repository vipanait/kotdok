import { describe, expect, it, vi } from 'vitest'
import type { CheckQuestionThread } from '@lapka/contracts'
import ru from '@/shared/i18n/dictionaries/ru'
import en from '@/shared/i18n/dictionaries/en'
import CheckQuestions from '@/features/symptom-check/CheckQuestions'
import { render, tags } from './static-render'

vi.mock('@/features/api/browser-api', () => ({ browserApi: () => ({}) }))

// CQ-02: the questions block as first painted. What a press does is the API's
// and the view helpers' (check-questions-view.test.ts).

const CHECK = '11111111-1111-4111-8111-000000000001'
const PET = '22222222-2222-4222-8222-000000000001'
const LATER = '2099-01-01T00:00:00.000Z'

const answered = (over: Partial<CheckQuestionThread['items'][number]> = {}) => ({
  id: '11111111-1111-4111-8111-0000000000a1',
  question: 'Можно ли кормить?',
  answer: 'Небольшими порциями через два часа.',
  alert: 'none' as const,
  off_topic: false,
  created_at: '2026-11-13T10:00:00.000Z',
  ...over,
})

function block(thread: Partial<CheckQuestionThread> = {}, props: { urgency?: 'monitor' | 'urgent' | 'emergency'; locale?: 'ru' | 'en'; page?: 'ru' | 'en' } = {}) {
  const locale = props.locale ?? 'ru'
  return render(
    <CheckQuestions
      checkId={CHECK}
      urgency={props.urgency ?? 'monitor'}
      locale={locale}
      petId={PET}
      petName="Мурка"
      followupCase={null}
      initial={{ items: [], limit: 3, remaining: 3, open_until: LATER, closed: null, ...thread }}
      words={(locale === 'ru' ? ru : en).checkQuestions}
      timeZone="UTC"
    />,
    props.page ?? locale,
  )
}

describe('the questions block under a result', () => {
  it('offers three questions for the level, a field and the count', () => {
    const html = block()
    expect(tags(html, 'h2').map((h) => h.text)).toEqual(['Уточнить по этой проверке'])
    expect(html).toContain('Осталось 3 вопроса из 3')
    expect(tags(html, 'button').filter((b) => b.attrs.class?.includes('chip')).map((b) => b.text)).toEqual([
      'На что смотреть в ближайшие сутки?',
      'Можно ли кормить как обычно?',
      'Когда точно пора к врачу?',
    ])
    const field = tags(html, 'textarea')[0]!
    expect(field.attrs.maxlength).toBe('500')
    expect(field.attrs['aria-label']).toBe('Ваш вопрос')
    expect(tags(html, 'button').some((b) => b.text === 'Спросить')).toBe(true)
    expect(html).toContain('Лапка не ставит диагноз и не назначает лечение.')
  })

  it('shows what was asked and answered, and drops the suggestions after the first question', () => {
    const html = block({ items: [answered()], remaining: 2 })
    expect(html).toContain('Вы спросили')
    expect(html).toContain('Можно ли кормить?')
    expect(html).toContain('Небольшими порциями через два часа.')
    expect(tags(html, 'button').filter((b) => b.attrs.class?.includes('chip'))).toEqual([])
    expect(html).toContain('Осталось 2 вопроса из 3')
  })

  it('puts the fixed plate with a clinic search and a re-check under an alarming answer', () => {
    const html = block({ items: [answered({ alert: 'clinic_now', answer: 'Это меняет картину.' })], remaining: 2 })
    expect(html).toContain('Это может быть опасно. Езжайте в клинику сейчас.')
    const links = tags(html, 'a')
    expect(links.find((a) => a.text.includes('Найти клинику'))?.attrs.href).toMatch(/^https:\/\//)
    expect(links.find((a) => a.text.includes('Проверить снова'))?.attrs.href).toBe(`/check?pet=${PET}`)
  })

  it('has no field once the three are used, and says so', () => {
    const html = block({ items: [answered(), answered({ id: '11111111-1111-4111-8111-0000000000a2' }), answered({ id: '11111111-1111-4111-8111-0000000000a3' })], remaining: 0, closed: 'limit' })
    expect(tags(html, 'textarea')).toEqual([])
    expect(html).toContain('Вопросы по этой проверке закончились')
    expect(html).toContain('Можно ли кормить?')
  })

  it('has no field after the 48 hours but keeps the thread', () => {
    const html = block({ items: [answered()], remaining: 2, closed: 'expired' })
    expect(tags(html, 'textarea')).toEqual([])
    expect(html).toContain('Вопросы можно задать в течение 48 часов после проверки.')
  })

  it('draws nothing after the 48 hours when nothing was asked', () => {
    expect(block({ closed: 'expired' })).toBe('')
  })

  it('speaks the language of the check on a page in another one', () => {
    const html = block({}, { locale: 'en', page: 'ru' })
    expect(html).toContain('Ask about this check')
    expect(tags(html, 'section')[0]!.attrs.lang).toBe('en')
    expect(tags(block(), 'section')[0]!.attrs.lang).toBeUndefined()
  })
})

describe('the result around the block (criterion 23)', () => {
  const check = {
    id: null as string | null,
    symptoms_input: 'рвота',
    urgency: 'monitor' as const,
    urgency_reason: 'r',
    possible_causes: [],
    species_specific_warning: null,
    home_care_steps: [],
    vet_questions: [],
    full_response: {},
    created_at: '2026-11-13T10:00:00.000Z',
    locale: 'ru' as const,
    pet_id: null,
    pet_name: null,
    pet_species: null,
  }
  const thread = { items: [], limit: 3, remaining: 3, open_until: LATER, closed: null }

  it('draws no block for a result shown inside the form, which has no saved id', async () => {
    const { default: CheckResultContent } = await import('@/features/symptom-check/CheckResultContent')
    const html = render(
      <CheckResultContent check={check} dict={ru} locale="ru" questions={{ thread, words: ru.checkQuestions }} onNewCheck={() => undefined} />,
    )
    expect(html).not.toContain('Уточнить по этой проверке')
  })

  it('draws the result without the block when the thread could not be read', async () => {
    const { default: CheckResultContent } = await import('@/features/symptom-check/CheckResultContent')
    const saved = { ...check, id: CHECK }
    expect(render(<CheckResultContent check={saved} dict={ru} locale="ru" questions={null} />)).not.toContain('Уточнить по этой проверке')
    expect(render(<CheckResultContent check={saved} dict={ru} locale="ru" questions={{ thread, words: ru.checkQuestions }} />)).toContain(
      'Уточнить по этой проверке',
    )
  })
})
