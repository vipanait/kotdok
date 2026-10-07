import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HealthProduct } from '@lapka/contracts'
import ru from '@/shared/i18n/dictionaries/ru'
import CatalogCombobox from '@/features/medical-record/events/CatalogCombobox'
import {
  SEARCH_DELAY_MS,
  comboboxKey,
  searchKey,
  startSearch,
  type CatalogSearch,
  type SearchDeps,
} from '@/features/medical-record/events/catalog-combobox'
import { render, tag, tags } from './static-render'

// «Найти препарат» (MW-03): the combobox as it first paints, its keyboard
// (WAI-ARIA combobox pattern) and its searches — an older search is
// cancelled, and its late answer never replaces a newer one.

const words = ru.medicalRecord.catalog

const product = (id: number, name: string): HealthProduct => ({
  id: `11111111-1111-4111-8111-${String(id).padStart(12, '0')}`,
  kind: 'vaccine',
  name,
  name_en: null,
  manufacturer: 'MSD',
  aliases: [],
  species: ['cat'],
  form: null,
  targets: ['rabies'],
  interval: null,
  popular: true,
})

describe('the combobox as it first paints', () => {
  it('is a labelled combobox, closed, owning its listbox, with the two ways out already listed', () => {
    const html = render(
      <CatalogCombobox species="cat" productKind="vaccine" label="Вакцина" onPick={() => {}} onManual={() => {}} onNoProduct={() => {}} />,
    )
    const input = tag(html, 'input', (el) => el.attrs.role === 'combobox')
    const list = tag(html, 'ul', (el) => el.attrs.role === 'listbox')
    expect(input.attrs['aria-expanded']).toBe('false')
    expect(input.attrs['aria-autocomplete']).toBe('list')
    expect(input.attrs['aria-controls']).toBe(list.attrs.id)
    expect(input.attrs['aria-activedescendant']).toBeUndefined()
    expect(input.attrs.placeholder).toBe(words.placeholder)
    expect(tag(html, 'label', (el) => el.attrs.for === input.attrs.id).text).toBe('Вакцина')
    expect(list.attrs['aria-label']).toBe('Вакцина')
    // Nothing is searched before the owner comes to the field; the ways out are there.
    expect(tags(html, 'li').map((li) => [li.attrs.role, li.text])).toEqual([
      ['option', words.manual],
      ['option', words.noProduct],
    ])
    expect(tag(html, 'div', (el) => (el.attrs.class ?? '').startsWith('catalog-popup')).attrs.class).toBe('catalog-popup hidden')
    // The live region is empty while the list is closed.
    expect(tag(html, 'span', (el) => el.attrs.role === 'status').text).toBe('')
  })

  it('can be switched off with the form while it saves', () => {
    const html = render(
      <CatalogCombobox species="dog" productKind="antiparasitic" label="Препарат" onPick={() => {}} onManual={() => {}} onNoProduct={() => {}} disabled />,
    )
    expect('disabled' in tag(html, 'input', (el) => el.attrs.role === 'combobox').attrs).toBe(true)
  })
})

describe('the keyboard', () => {
  const closed = { open: false, active: -1 }
  const N = 4

  it('↓ opens on the first option, ↑ on the last; both are the list’s, not the caret’s', () => {
    expect(comboboxKey(closed, 'ArrowDown', N)).toMatchObject({ state: { open: true, active: 0 }, prevent: true })
    expect(comboboxKey(closed, 'ArrowUp', N)).toMatchObject({ state: { open: true, active: 3 }, prevent: true })
  })

  it('moves round the open list', () => {
    expect(comboboxKey({ open: true, active: 3 }, 'ArrowDown', N)?.state.active).toBe(0)
    expect(comboboxKey({ open: true, active: 0 }, 'ArrowUp', N)?.state.active).toBe(3)
    expect(comboboxKey({ open: true, active: 1 }, 'ArrowDown', N)?.state.active).toBe(2)
    // Typing leaves no active option: ↓ starts from the first.
    expect(comboboxKey({ open: true, active: -1 }, 'ArrowDown', N)?.state.active).toBe(0)
  })

  it('Enter picks the active option and closes; with none it opens the list — and never submits the form', () => {
    expect(comboboxKey({ open: true, active: 2 }, 'Enter', N)).toEqual({ state: { open: false, active: -1 }, pick: 2, prevent: true, stop: false })
    expect(comboboxKey({ open: true, active: -1 }, 'Enter', N)).toMatchObject({ pick: null, prevent: true, state: { open: true } })
    expect(comboboxKey(closed, 'Enter', N)).toMatchObject({ pick: null, prevent: true, state: { open: true } })
  })

  it('Escape closes an open list and stops there; on a closed one it is not the combobox’s', () => {
    expect(comboboxKey({ open: true, active: 1 }, 'Escape', N)).toEqual({ state: closed, pick: null, prevent: true, stop: true })
    expect(comboboxKey(closed, 'Escape', N)).toBeNull()
  })

  it('Tab closes the list and moves on as usual; other keys are typing', () => {
    expect(comboboxKey({ open: true, active: 1 }, 'Tab', N)).toEqual({ state: closed, pick: null, prevent: false, stop: false })
    expect(comboboxKey({ open: true, active: 1 }, 'a', N)).toBeNull()
  })
})

describe('searching', () => {
  afterEach(() => vi.useRealTimers())

  /** A catalogue whose answers are held until the test lets each go; aborts are seen. */
  function catalogue() {
    const calls: { query: string; signal: AbortSignal; resolve: (products: HealthProduct[]) => void; reject: (error: unknown) => void }[] = []
    const deps: SearchDeps = {
      fetch: (_species, _kind, query, { signal }) =>
        new Promise((resolve, reject) => {
          calls.push({ query, signal, resolve, reject })
        }),
      setTimer: (run, ms) => setTimeout(run, ms),
      clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
      warn: () => {},
    }
    return { calls, deps }
  }
  const search = (wanted: string): CatalogSearch => ({ species: 'cat', productKind: 'vaccine', wanted })
  const settle = () => new Promise((resolve) => setImmediate(resolve))

  it('asks for the popular list at once, and waits for a pause in typing before a query', () => {
    vi.useFakeTimers()
    const { calls, deps } = catalogue()
    startSearch(search(''), deps, () => {})
    vi.advanceTimersByTime(0)
    expect(calls.map((call) => call.query)).toEqual([''])
    startSearch(search('нобив'), deps, () => {})
    vi.advanceTimersByTime(SEARCH_DELAY_MS - 1)
    expect(calls).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(calls.map((call) => call.query)).toEqual(['', 'нобив'])
  })

  it('sends nothing for a query typed over before the pause ended', () => {
    vi.useFakeTimers()
    const { calls, deps } = catalogue()
    const stop = startSearch(search('н'), deps, () => {})
    vi.advanceTimersByTime(SEARCH_DELAY_MS / 2)
    stop()
    startSearch(search('но'), deps, () => {})
    vi.advanceTimersByTime(SEARCH_DELAY_MS)
    expect(calls.map((call) => call.query)).toEqual(['но'])
  })

  it('aborts an older search in flight and drops its late answer; the newer one is shown', async () => {
    vi.useFakeTimers()
    const { calls, deps } = catalogue()
    const answers: [string, unknown][] = []
    const stopOld = startSearch(search('нобивак'), deps, (value) => answers.push(['нобивак', value]))
    vi.advanceTimersByTime(SEARCH_DELAY_MS)
    const stale = calls[0]
    stopOld()
    expect(stale.signal.aborted).toBe(true)
    startSearch(search('рабизин'), deps, (value) => answers.push(['рабизин', value]))
    vi.advanceTimersByTime(SEARCH_DELAY_MS)
    const fresh = calls[1]
    fresh.resolve([product(2, 'Рабизин')])
    // The old request answers after the new one — too late.
    stale.resolve([product(1, 'Нобивак Rabies')])
    vi.useRealTimers()
    await settle()
    expect(answers).toEqual([['рабизин', [product(2, 'Рабизин')]]])
  })

  it('an aborted search that fails says nothing; a live one that fails says so', async () => {
    const { calls, deps } = catalogue()
    const answers: unknown[] = []
    const stop = startSearch(search(''), deps, (value) => answers.push(value))
    await new Promise((resolve) => setTimeout(resolve, 0))
    stop()
    calls[0].reject(new DOMException('aborted', 'AbortError'))
    startSearch(search(''), deps, (value) => answers.push(value))
    await new Promise((resolve) => setTimeout(resolve, 0))
    calls[1].reject(new TypeError('fetch failed'))
    await settle()
    expect(answers).toEqual(['failed'])
  })

  it('keeps answers per pet kind and query: the same query is not asked twice', () => {
    expect(searchKey(search('нобив'))).toBe('cat:vaccine:нобив')
    expect(searchKey({ species: 'dog', productKind: 'vaccine', wanted: 'нобив' })).not.toBe(searchKey(search('нобив')))
  })
})
