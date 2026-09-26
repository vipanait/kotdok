import { describe, expect, it } from 'vitest'
import { VISIT_LIMITS, type HealthEvent, type SymptomCheckRecord } from '@lapka/contracts'
import { ApiError } from '@lapka/shared'
import ru from '@/shared/i18n/dictionaries/ru'
import {
  blankPrescription,
  blankVisit,
  draftFromPlan,
  heldDraft,
  readHeld,
  readNewVisit,
  readPlanChange,
  savesHeldVisit,
  switchVisitStatus,
  visitDraftChanged,
  type VisitDraft,
} from '@/features/medical-record/visits/visit-form'
import { visitErrorTexts } from '@/features/medical-record/visits/visit-form-text'
import { parseVisitSaved, visitRecord, visitsPage } from '@/features/medical-record/visits/visit-view'
import { eventSaveFailure } from '@/features/medical-record/events/event-form'
import { murka } from './demo-overviews'

// MW-06: vet visits, as data — the form (new, from a check, plan change,
// «Состоялся»), the section and one visit.

const TODAY = '2026-09-26'
const petId = murka.pet.id
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const held = murka.events.find((event) => event.id === uuid(107))!
const plan = murka.events.find((event) => event.id === uuid(108))!
const CHECK = uuid(901)
const utcDay = (iso: string) => iso.slice(0, 10)

function check(id: string, created_at: string, overrides: Partial<SymptomCheckRecord> = {}): SymptomCheckRecord {
  return {
    id,
    symptoms_input: 'Рвота два дня, отказ от еды',
    urgency: 'monitor',
    urgency_reason: '',
    possible_causes: [],
    species_specific_warning: null,
    home_care_steps: [],
    vet_questions: [],
    full_response: null,
    created_at,
    locale: 'ru',
    pet_id: petId,
    pet_name: 'Мурка',
    pet_species: 'cat',
    ...overrides,
  }
}

const withPrescriptions = (draft: VisitDraft, ...names: Array<[string, string, boolean]>): VisitDraft => ({
  ...draft,
  prescriptions: names.map(([name, instructions, toMedicines], index) => ({ ...blankPrescription(`p${index}`), name, instructions, toMedicines })),
})

describe('a new visit', () => {
  it('starts as «Был» today with nothing made up: no diagnosis, prescription or check', () => {
    expect(blankVisit(TODAY)).toEqual({
      status: 'done',
      date: TODAY,
      visitKind: 'checkup',
      clinic: '',
      reason: '',
      diagnosis: '',
      prescriptions: [],
      checkId: null,
      notes: '',
    })
  })

  it('from a check result: «Болезнь», its first line as the reason and that check — today, not the demo 2 August', () => {
    const draft = blankVisit(TODAY, { checkId: CHECK, reason: 'Рвота два дня, отказ от еды' })
    expect(draft).toMatchObject({ status: 'done', date: TODAY, visitKind: 'illness', reason: 'Рвота два дня, отказ от еды', checkId: CHECK })
    const read = readNewVisit(draft, TODAY)
    expect(read.ok && read.value.check_id).toBe(CHECK)
  })

  it('sends two prescriptions, each to the medicines only when ticked; new ones start empty and unticked', () => {
    expect(blankPrescription('x')).toEqual({ key: 'x', name: '', instructions: '', toMedicines: false })
    const draft = withPrescriptions({ ...blankVisit(TODAY), diagnosis: 'Гастрит' }, ['Фортифлора', '1 пакетик в день', true], ['Смекта', '', false])
    const read = readNewVisit(draft, TODAY)
    expect(read.ok && read.value).toEqual({
      status: 'done',
      date: TODAY,
      visit_kind: 'checkup',
      clinic: null,
      reason: null,
      notes: null,
      check_id: null,
      diagnosis: 'Гастрит',
      prescriptions: [
        { name: 'Фортифлора', instructions: '1 пакетик в день', add_to_medications: true },
        { name: 'Смекта', instructions: null, add_to_medications: false },
      ],
    })
  })

  it('«Запланировать» starts without a day, keeps what was typed and sends no diagnosis or prescriptions', () => {
    const typed = withPrescriptions({ ...blankVisit(TODAY), diagnosis: 'Гастрит', clinic: 'Айболит' }, ['Смекта', '', true])
    const planned = switchVisitStatus(typed, 'planned', TODAY)
    expect(planned).toMatchObject({ status: 'planned', date: '', clinic: 'Айболит', diagnosis: 'Гастрит' })
    expect(planned.prescriptions).toHaveLength(1)
    expect(readNewVisit(planned, TODAY)).toMatchObject({ ok: false, problems: { date: 'empty' } })
    const read = readNewVisit({ ...planned, date: '2026-10-03' }, TODAY)
    expect(read.ok && read.value).toEqual({
      status: 'planned',
      date: '2026-10-03',
      visit_kind: 'checkup',
      clinic: 'Айболит',
      reason: null,
      notes: null,
      check_id: null,
    })
    expect(switchVisitStatus(planned, 'done', TODAY).prescriptions).toHaveLength(1)
  })

  it('refuses a held visit after today, a plan before it, a nameless prescription and texts over the limits', () => {
    expect(readNewVisit({ ...blankVisit(TODAY), date: '2026-09-27' }, TODAY)).toMatchObject({ ok: false, problems: { date: 'future' } })
    expect(readNewVisit({ ...blankVisit(TODAY), status: 'planned', date: '2026-09-25' }, TODAY)).toMatchObject({ ok: false, problems: { date: 'past' } })
    const read = readNewVisit(
      withPrescriptions(
        { ...blankVisit(TODAY), clinic: 'к'.repeat(101), reason: 'р'.repeat(501), diagnosis: 'д'.repeat(501), notes: 'з'.repeat(301) },
        [' ', '', false],
        ['Ф'.repeat(101), 'x'.repeat(151), false],
      ),
      TODAY,
    )
    expect(read.ok).toBe(false)
    if (read.ok) return
    expect(read.problems).toEqual({
      texts: ['clinic', 'reason', 'diagnosis', 'notes'],
      prescription: { p0: { name: 'empty' }, p1: { name: 'tooLong', instructions: 'tooLong' } },
    })
    const texts = visitErrorTexts(ru, read.problems)
    expect(texts).toMatchObject({
      clinic: 'Клиника — не длиннее 100 символов',
      reason: 'Причина — не длиннее 500 символов',
      diagnosis: 'Диагноз — не длиннее 500 символов',
      notes: 'Заметка — не длиннее 300 символов',
    })
    expect(texts.prescription).toEqual({
      p0: { name: 'Введите название', instructions: undefined },
      p1: { name: 'Название — не длиннее 100 символов', instructions: 'Не длиннее 150 символов' },
    })
  })

  it('takes at most ten prescriptions', () => {
    const eleven = Array.from({ length: VISIT_LIMITS.prescriptions + 1 }, (_, i): [string, string, boolean] => [`П${i}`, '', false])
    const read = readNewVisit(withPrescriptions(blankVisit(TODAY), ...eleven), TODAY)
    expect(read).toMatchObject({ ok: false, problems: { prescriptions: 'tooMany' } })
    expect(visitErrorTexts(ru, { prescriptions: 'tooMany' }).prescriptions).toBe('В одном визите — не больше 10 назначений.')
  })

  it('warns before saving a visit that happened, not a plan', () => {
    expect(savesHeldVisit(blankVisit(TODAY))).toBe(true)
    expect(savesHeldVisit(switchVisitStatus(blankVisit(TODAY), 'planned', TODAY))).toBe(false)
  })
})

describe('a plan: changed, moved, or marked «Состоялся»', () => {
  it('opens with the plan’s own values and sends only what changed; nothing changed is nothing', () => {
    const draft = draftFromPlan(plan)
    expect(draft).toMatchObject({ status: 'planned', date: '2026-10-03', visitKind: 'checkup', reason: 'Контрольный осмотр' })
    expect(readPlanChange(plan, draft, TODAY)).toEqual({ ok: true, value: null })
    const moved = readPlanChange(plan, { ...draft, date: '2026-10-10', clinic: 'Вет-центр' }, TODAY)
    expect(moved.ok && moved.value).toEqual({ date: '2026-10-10', clinic: 'Вет-центр' })
    expect(visitDraftChanged(draft, { ...draft, clinic: 'x' })).toBe(true)
    expect(visitDraftChanged(draft, draftFromPlan(plan))).toBe(false)
  })

  it('an overdue plan keeps its own day; a move goes forward only', () => {
    const overdue: HealthEvent = { ...plan, date: '2026-09-20' }
    const draft = draftFromPlan(overdue)
    const kept = readPlanChange(overdue, { ...draft, clinic: 'Айболит' }, TODAY)
    expect(kept.ok && kept.value).toEqual({ clinic: 'Айболит' })
    expect(readPlanChange(overdue, { ...draft, date: '2026-09-21' }, TODAY)).toMatchObject({ ok: false, problems: { date: 'past' } })
  })

  it('keeps an older linked check, and may unlink it', () => {
    const linked: HealthEvent = { ...plan, check_id: CHECK }
    expect(draftFromPlan(linked).checkId).toBe(CHECK)
    const unlinked = readPlanChange(linked, { ...draftFromPlan(linked), checkId: null }, TODAY)
    expect(unlinked.ok && unlinked.value).toEqual({ check_id: null })
  })

  it('«Состоялся» sends the whole visit as happened: the day (today for a plan still ahead), diagnosis, prescriptions', () => {
    const draft = heldDraft(plan, TODAY)
    expect(draft).toMatchObject({ status: 'done', date: TODAY, reason: 'Контрольный осмотр' })
    expect(heldDraft({ ...plan, date: '2026-09-20' }, TODAY).date).toBe('2026-09-20')
    const read = readHeld(plan, withPrescriptions({ ...draft, diagnosis: 'Здорова' }, ['Витамины', '', true]), TODAY)
    expect(read.ok && read.value).toEqual({
      status: 'done',
      date: TODAY,
      visit_kind: 'checkup',
      clinic: null,
      reason: 'Контрольный осмотр',
      diagnosis: 'Здорова',
      notes: null,
      check_id: null,
      prescriptions: [{ name: 'Витамины', instructions: null, add_to_medications: true }],
    })
    expect(readHeld(plan, { ...draft, date: '2026-09-27' }, TODAY)).toMatchObject({ ok: false, problems: { date: 'future' } })
  })

  it('never opens a visit that happened', () => {
    expect(() => draftFromPlan(held)).toThrow()
    expect(() => readHeld(held, blankVisit(TODAY), TODAY)).toThrow()
  })

  it('treats `record_done` from the server as «done», so the page reads the visit again', () => {
    expect(eventSaveFailure(new ApiError('record_done', 409, 'x'))).toBe('done')
    expect(eventSaveFailure(new ApiError('not_found', 404, 'x'))).toBe('gone')
    expect(eventSaveFailure(new ApiError('conflict', 409, 'x'))).toBe('alreadySaved')
  })
})

describe('the visits page and one visit', () => {
  const checks = [check(CHECK, '2026-08-01T09:30:00Z')]
  const linkedHeld: HealthEvent = {
    ...held,
    check_id: CHECK,
    items: [
      { id: uuid(301), name: 'Фортифлора', targets: [], source_item_id: null, product_id: null, interval: null, instructions: '1 пакетик в день, 14 дней', medication_id: uuid(402) },
      { id: uuid(302), name: 'Лечебный корм', targets: [], source_item_id: null, product_id: null, interval: null, instructions: 'постоянно', medication_id: null },
    ],
  }
  const overview = { ...murka, events: murka.events.map((event) => (event.id === held.id ? linkedHeld : event)) }

  it('lists plans soonest first, then visits that happened, a linked one with its check', () => {
    const view = visitsPage(ru, 'ru', overview, checks, TODAY, utcDay)
    expect(view.subtitle).toBe('Мурка · Диагнозы и назначения врача')
    expect(view.planned.map((card) => [card.day, card.kind, card.summary, card.due?.text])).toEqual([
      ['3 октября 2026', 'Осмотр', 'Контрольный осмотр', 'Через 7 дней · 3 октября'],
    ])
    const [done] = view.done
    expect([done.day, done.kind, done.clinic, done.summary]).toEqual(['2 августа 2026', 'Болезнь', 'Айболит', 'Обострение гастрита'])
    expect(done.check).toEqual({ href: `/check/${CHECK}`, text: 'По проверке 1 августа', urgency: 'monitor', urgencyText: 'Наблюдаем' })
    expect(done.label).toContain('По проверке 1 августа, Наблюдаем')
    // A check not among the loaded ones still leads back, without a day.
    expect(visitsPage(ru, 'ru', overview, [], TODAY, utcDay).done[0].check?.text).toBe('По проверке')
  })

  it('is empty only with no visit at all', () => {
    expect(visitsPage(ru, 'ru', { ...murka, events: [] }, [], TODAY).empty).toBe(true)
    expect(visitsPage(ru, 'ru', murka, [], TODAY).empty).toBe(false)
  })

  it('a visit that happened is only read: no «Состоялся», no «Изменить», deletion and «Добавить в лекарства» stay', () => {
    const view = visitRecord(ru, 'ru', petId, linkedHeld, checks, TODAY, murka.writable, undefined, utcDay)
    expect([view.heldHref, view.editHref, view.removable]).toEqual([null, null, true])
    expect(view.actionsBody).toBe('Визит состоялся. Запись доступна только для просмотра.')
    expect(view.prescriptions).toEqual([
      { id: uuid(301), name: 'Фортифлора', instructions: '1 пакетик в день, 14 дней', courseHref: `/pets/${petId}/health/${uuid(402)}`, addable: false },
      { id: uuid(302), name: 'Лечебный корм', instructions: 'постоянно', courseHref: null, addable: true },
    ])
    expect(view.coursesHref).toBe(`/pets/${petId}/health/medications`)
    expect(view.check?.href).toBe(`/check/${CHECK}`)
    expect(view.removeTitle).toBe('Удалить визит 2 августа 2026?')
  })

  it('a plan has «Состоялся», «Изменить» and «Отменить план» naming it; an older server gets none of them', () => {
    const view = visitRecord(ru, 'ru', petId, plan, [], TODAY, murka.writable)
    expect(view.heldHref).toBe(`/pets/${petId}/health/${plan.id}/complete`)
    expect(view.editHref).toBe(`/pets/${petId}/health/${plan.id}/edit`)
    expect(view.removeTitle).toBe('Отменить план: визит 3 октября 2026?')
    expect(view.kind).toBe('Осмотр или профилактика')
    const older = visitRecord(ru, 'ru', petId, plan, [], TODAY, ['weight'])
    expect([older.heldHref, older.editHref, older.removable]).toEqual([null, null, false])
  })

  it('reads ?saved= strictly', () => {
    expect(parseVisitSaved('held')).toBe('held')
    expect(parseVisitSaved('completed')).toBeNull()
  })
})
