import { describe, expect, it, vi } from 'vitest'
import ru from '@/shared/i18n/dictionaries/ru'
import en from '@/shared/i18n/dictionaries/en'
import CheckinScreen from '@/features/followup/CheckinScreen'
import DecisionPanel from '@/features/followup/DecisionPanel'
import FollowupBanners from '@/features/followup/FollowupBanners'
import ReminderCard from '@/features/followup/ReminderCard'
import { CASE, ORIGIN, OTHER_PET, PET, summary } from '../features/followup/demo-cases'
import { render, tag, tags } from './static-render'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }))

// The follow-up loop's screens as first painted (FU-02, FU-03, FU-07). What
// happens on a press is the API's: these check that each state draws what
// the design and the decision table say, and nothing it should not.

const words = ru.followup

/** The answers' drawings, not the pet's avatar beside the form. */
const moods = (html: string) => tags(html, 'img').filter((img) => img.attrs.class === 'mood-art')

function checkin(props: Partial<Parameters<typeof CheckinScreen>[0]> = {}) {
  return render(
    <CheckinScreen
      item={summary()}
      petLine="Кошка · Сибирская · 6 лет"
      latestCheckId={ORIGIN}
      latestCheckAt="2026-10-23T06:00:00.000Z"
      homeCareSteps={[]}
      credits={2}
      initialAnswer={null}
      source="timeline"
      timeZone="UTC"
      {...props}
    />,
  )
}

describe('the check-in form', () => {
  it('asks «Как Мурка сейчас?» with three labelled answers and a cat for each', () => {
    const html = checkin()
    expect(tags(html, 'h1').map((h) => h.text)).toEqual(['Как Мурка сейчас?'])
    const radios = tags(html, 'input').filter((input) => input.attrs.type === 'radio')
    expect(radios.map((radio) => radio.attrs.value)).toEqual(['better', 'same', 'worse'])
    expect(radios.some((radio) => 'checked' in radio.attrs)).toBe(false)
    // Each answer is named by its words; the drawing is decorative.
    for (const state of ['better', 'same', 'worse'] as const) {
      expect(html).toContain(words.states[state])
      expect(html).toContain(words.stateHints[state])
    }
    const images = moods(html)
    expect(images).toHaveLength(3)
    expect(images.every((img) => img.attrs.alt === '' && img.attrs.src.includes('mood-cat'))).toBe(true)
    // No vet question on a watching slot.
    expect(html).not.toContain(words.vetQuestion)
    expect(tag(html, 'textarea', () => true).attrs.maxlength).toBe('500')
    expect(html).toContain(words.nextBody)
    expect(html).toContain(words.nextFree)
  })

  it('draws a dog for a dog and no animal for a species it does not know', () => {
    const dog = moods(checkin({ item: summary({ pet_species: 'dog' }) }))
    expect(dog).toHaveLength(3)
    expect(dog.every((img) => img.attrs.src.includes('mood-dog'))).toBe(true)
    const unknown = checkin({ item: summary({ pet_species: 'rabbit' as never }) })
    expect(moods(unknown)).toHaveLength(0)
    expect(unknown).toContain(words.states.better)
  })

  it('keeps the answer chosen on the overview, unsent', () => {
    const radios = tags(checkin({ initialAnswer: 'worse' }), 'input').filter((input) => input.attrs.type === 'radio')
    expect(radios.filter((radio) => 'checked' in radio.attrs).map((radio) => radio.attrs.value)).toEqual(['worse'])
  })

  it('asks about the vet first when the case is waiting for that answer', () => {
    const html = checkin({ item: summary({ next_slot: 'vet', plan: 'vet', current_urgency: 'urgent' }) })
    expect(html).toContain(words.vetQuestion)
    expect(html).toContain(words.vetYes)
    expect(html).toContain(words.vetNo)
    expect(tags(html, 'input').filter((input) => input.attrs.type === 'radio')).toHaveLength(5)
  })

  it('says a closed case takes no more answers and offers its timeline', () => {
    const html = checkin({ item: summary({ status: 'closed', outcome: 'improved', closed_at: '2026-10-25T06:00:00.000Z', next_slot: null, next_due_at: null }) })
    expect(tags(html, 'h1').map((h) => h.text)).toEqual([words.closedTitle])
    expect(html).toContain('Мурка · 25 октября · Стало лучше')
    expect(html).toContain(words.closedBody)
    expect(tags(html, 'form')).toHaveLength(0)
    expect(tag(html, 'a', (a) => a.text === words.toTimeline).attrs.href).toBe(`/checks/case/${CASE}`)
  })
})

describe('the outcome of an answer', () => {
  function panel(decision: Parameters<typeof DecisionPanel>[0]['decision'], credits = 2, patch = {}) {
    return render(
      <DecisionPanel
        decision={decision}
        item={summary(patch)}
        latestCheckId={ORIGIN}
        latestCheckAt="2026-10-23T06:00:00.000Z"
        homeCareSteps={['Давайте воду', 'Следите за аппетитом']}
        credits={credits}
      />,
    )
  }

  it('«лучше»: the case is closed, the health record offered', () => {
    const html = panel('close_improved', 2, { status: 'closed', outcome: 'improved' })
    expect(tags(html, 'h2').map((h) => h.text)).toEqual(['Хорошо, что стало лучше'])
    expect(html).toContain(words.improvedBody)
    expect(tags(html, 'button').map((b) => b.text)).toEqual([words.recordSave])
    expect(html).toContain(words.recordNote)
  })

  it('«так же» in the middle: keep watching, with the latest check’s home care', () => {
    const html = panel('keep_watching')
    expect(tags(html, 'h2').map((h) => h.text)).toEqual([words.keepTitle])
    expect(html).toContain(words.homeCare)
    expect(html).toContain('Давайте воду')
    // No clinic and no re-check on a calm outcome.
    expect(html).not.toContain(ru.check.findClinic)
    expect(html).not.toContain(words.recheck)
  })

  it.each([
    ['see_vet', words.seeVetTitle],
    ['see_vet_today', words.seeVetTodayTitle],
    ['clinic_now', words.clinicNowTitle],
  ] as const)('«%s»: the clinic first, then the visit, then a paid re-check', (decision, title) => {
    const html = panel(decision)
    expect(tags(html, 'h2').map((h) => h.text)).toEqual([title])
    const links = tags(html, 'a')
    expect(links.map((a) => a.text.trim())).toEqual([ru.check.findClinic, words.recordVisit, words.recheck])
    expect(links[0].attrs.target).toBe('_blank')
    expect(links[0].attrs.href).toContain('google.com/maps/search')
    expect(links[1].attrs.href).toBe(`/pets/${PET}/health/new?type=visit&check=${ORIGIN}`)
    expect(links[2].attrs.href).toBe(`/check?pet=${PET}&case=${CASE}`)
    expect(html).toContain('Спишется 1 проверка, у вас 2')
  })

  it('with no checks left: the clinic and the visit stay, the re-check becomes the request for more', () => {
    const html = panel('see_vet_today', 0)
    const links = tags(html, 'a')
    expect(links.map((a) => a.text.trim())).toEqual([ru.check.findClinic, words.recordVisit, words.requestMore])
    expect(links[2].attrs.href).toBe('/credits')
    expect(html).toContain(words.noCredits)
    expect(html).not.toContain(words.recheck)
  })

  it('«были у врача — да»: the visit form linked to the case’s latest check', () => {
    const html = panel('vet_seen', 2, { status: 'closed', outcome: 'vet_seen' })
    expect(tags(html, 'h2').map((h) => h.text)).toEqual([words.vetSeenTitle])
    expect(tag(html, 'a', (a) => a.text === words.recordVisit).attrs.href).toBe(`/pets/${PET}/health/new?type=visit&check=${ORIGIN}`)
  })
})

describe('the overview’s banners', () => {
  const cases = [
    summary({ id: '22222222-2222-4222-8222-00000000000a' }),
    summary({ id: '22222222-2222-4222-8222-00000000000b', pet_id: OTHER_PET, pet_name: 'Бобик', pet_species: 'dog' }),
    summary({ id: '22222222-2222-4222-8222-00000000000c', pet_id: 'p3', pet_name: 'Кекс' }),
  ]

  it('shows two banners and «Ещё N случаев» for the rest', () => {
    const html = render(<FollowupBanners cases={cases} photosByPet={{}} timeZone="UTC" />)
    expect(tags(html, 'h2').map((h) => h.text)).toEqual(['Как Мурка после проверки 23 октября?', 'Как Бобик после проверки 23 октября?'])
    expect(tags(html, 'button').map((b) => b.text)).toContain('Ещё 1 случай')
  })

  it('offers the three answers as links that preselect, and «Скрыть до завтра»', () => {
    const html = render(<FollowupBanners cases={cases.slice(0, 1)} photosByPet={{}} timeZone="UTC" />)
    const answers = tags(html, 'a').map((a) => [a.text, a.attrs.href])
    expect(answers).toEqual([
      ['Лучше', `/checks/case/${cases[0].id}/checkin?answer=better&from=banner`],
      ['Так же', `/checks/case/${cases[0].id}/checkin?answer=same&from=banner`],
      ['Хуже', `/checks/case/${cases[0].id}/checkin?answer=worse&from=banner`],
    ])
    expect(tags(html, 'button').map((b) => b.text)).toEqual([words.bannerHide])
  })

  it('puts the clinic first once the rule sent the owner to a vet', () => {
    const html = render(
      <FollowupBanners cases={[summary({ escalation: 'see_vet_today', next_slot: 'vet' })]} photosByPet={{}} timeZone="UTC" />,
    )
    const links = tags(html, 'a')
    expect(links.map((a) => a.text.trim())).toEqual([ru.check.findClinic, words.bannerCheckin])
    expect(html).toContain(words.seeVetTodayTitle)
    expect(html).toContain(words.bannerBodyVet)
  })

  it('draws nothing without due cases', () => {
    expect(render(<FollowupBanners cases={[]} photosByPet={{}} timeZone="UTC" />)).toBe('')
  })
})

describe('the reminder on a result', () => {
  const offer = {
    plan: 'watch' as const,
    default_enabled: true,
    first_due_at: '2026-10-23T18:00:00.000Z',
    due_at: ['2026-10-23T18:00:00.000Z', '2026-10-25T06:00:00.000Z'],
    replaces: null,
  }

  it('is a switch, on for an active case, with the web and app explained', () => {
    const html = render(
      <ReminderCard checkId={ORIGIN} petName="Мурка" urgency="monitor" initial={{ offer, case: summary(), role: 'origin' }} timeZone="UTC" />,
    )
    expect(tags(html, 'h2').map((h) => h.text)).toEqual(['Напомнить, как Мурка?'])
    const toggle = tag(html, 'button', (b) => b.attrs.role === 'switch')
    expect(toggle.attrs['aria-checked']).toBe('true')
    expect(html).toContain(words.offerWatch12)
    expect(html).toContain(words.offerWeb)
  })

  it('is off for a case switched off, and warns before replacing the pet’s other case', () => {
    const html = render(
      <ReminderCard
        checkId={ORIGIN}
        petName="Мурка"
        urgency="urgent"
        initial={{
          offer: { ...offer, plan: 'vet', default_enabled: false, replaces: { case_id: CASE, origin_checked_at: '2026-10-20T06:00:00.000Z' } },
          case: summary({ status: 'off', next_slot: 'vet' }),
          role: 'origin',
        }}
        timeZone="UTC"
      />,
    )
    expect(tag(html, 'button', (b) => b.attrs.role === 'switch').attrs['aria-checked']).toBe('false')
    expect(html).toContain(words.offerVet)
    expect(html).toContain(words.offerOff)
    expect(html).toContain('Уже идёт наблюдение: Мурка, проверка 20 октября')
  })

  it('on a re-check, links its case instead of a second switch', () => {
    const html = render(
      <ReminderCard
        checkId={ORIGIN}
        petName="Мурка"
        urgency="home_care"
        initial={{ offer: null, case: summary({ checkin_count: 2 }), role: 'recheck' }}
        timeZone="UTC"
      />,
    )
    expect(tags(html, 'button')).toHaveLength(0)
    expect(tag(html, 'a', () => true).attrs.href).toBe(`/checks/case/${CASE}`)
    expect(html).toContain('Часть случая от 23 октября · 2 отметки')
  })

  it('draws nothing for a check with neither an offer nor a case', () => {
    expect(
      render(<ReminderCard checkId={ORIGIN} petName="Мурка" urgency="monitor" initial={{ offer: null, case: null, role: null }} />),
    ).toBe('')
  })

  it('has its English words', () => {
    const html = render(
      <ReminderCard checkId={ORIGIN} petName="Murka" urgency="home_care" initial={{ offer, case: summary(), role: 'origin' }} />,
      'en',
    )
    expect(tags(html, 'h2').map((h) => h.text)).toEqual(['Check in on Murka later?'])
    expect(tags(html, 'p').map((p) => p.text)).toContain(en.followup.offerWatch24)
  })
})
