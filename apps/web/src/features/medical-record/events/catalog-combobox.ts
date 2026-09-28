import type { HealthProduct, PetSpecies, ProductKind } from '@lapka/contracts'

/**
 * The catalogue combobox's behaviour apart from React (CatalogCombobox.tsx),
 * so its keyboard and its searches are unit tested: the keys of the WAI-ARIA
 * combobox pattern, and a search that the screen no longer needs — an older
 * query, a pause not yet over — never lands.
 */

/** How long typing pauses before a search is sent. */
export const SEARCH_DELAY_MS = 200

export type ComboboxState = { open: boolean; active: number }

/**
 * What a key does to the list: ↓/↑ open it on the first/last option or
 * move through it (round), Enter picks the active option (or opens the list;
 * it never submits the form), Escape closes an open list (and goes no
 * further — an open dialog behind it stays), Tab closes it and moves on.
 * `prevent`: the key's own action in the input is cancelled.
 */
export type ComboboxKeyResult = {
  state: ComboboxState
  /** The option Enter picked. */
  pick: number | null
  prevent: boolean
  /** Escape was used by the list: it does not reach anything behind it. */
  stop: boolean
}

export function comboboxKey(state: ComboboxState, key: string, count: number): ComboboxKeyResult | null {
  const result = (next: ComboboxState, extra: Partial<Omit<ComboboxKeyResult, 'state'>> = {}): ComboboxKeyResult => ({
    state: next,
    pick: null,
    prevent: false,
    stop: false,
    ...extra,
  })
  switch (key) {
    case 'ArrowDown':
    case 'ArrowUp': {
      const down = key === 'ArrowDown'
      if (!state.open) return result({ open: true, active: down ? 0 : count - 1 }, { prevent: true })
      if (count === 0) return result(state, { prevent: true })
      return result({ open: true, active: (state.active + (down ? 1 : -1) + count) % count }, { prevent: true })
    }
    case 'Enter':
      if (state.open && state.active >= 0 && state.active < count) return result({ open: false, active: -1 }, { pick: state.active, prevent: true })
      return result({ open: true, active: state.active }, { prevent: true })
    case 'Escape':
      return state.open ? result({ open: false, active: -1 }, { prevent: true, stop: true }) : null
    case 'Tab':
      return result({ open: false, active: -1 })
    default:
      return null
  }
}

/** Answers by search: the products, or that the search failed. */
export type CatalogAnswer = HealthProduct[] | 'failed'

export type CatalogSearch = { species: PetSpecies; productKind: ProductKind; wanted: string }

/** What a search goes out through: the API and the clock, replaced in tests. */
export type SearchDeps = {
  fetch: (species: PetSpecies, productKind: ProductKind, query: string, init: { signal: AbortSignal }) => Promise<HealthProduct[]>
  setTimer: (run: () => void, ms: number) => unknown
  clearTimer: (timer: unknown) => void
  /** A failed search, for whoever debugs it: expected when offline, not an error. */
  warn?: (error: unknown) => void
}

/**
 * One search: sent once typing has paused (at once for the popular list,
 * nothing typed), its answer handed to `answer` — unless `stop` was called
 * first. `stop` is what the screen calls when the query changes or the list
 * closes: the pause is cancelled, the request aborted, and an answer that
 * arrives anyway is dropped.
 */
export function startSearch(search: CatalogSearch, deps: SearchDeps, answer: (value: CatalogAnswer) => void): () => void {
  const controller = new AbortController()
  const timer = deps.setTimer(
    () => {
      deps
        .fetch(search.species, search.productKind, search.wanted, { signal: controller.signal })
        .then((products) => {
          if (!controller.signal.aborted) answer(products)
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          deps.warn?.(error)
          answer('failed')
        })
    },
    search.wanted === '' ? 0 : SEARCH_DELAY_MS,
  )
  return () => {
    deps.clearTimer(timer)
    controller.abort()
  }
}

/** The key an answer is kept under: the same query for the same pet and kind is asked once. */
export function searchKey(search: CatalogSearch): string {
  return `${search.species}:${search.productKind}:${search.wanted}`
}
