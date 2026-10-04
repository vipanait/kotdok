import type { HealthProduct } from '@lapka/contracts'
import { matchesCatalog } from '@lapka/shared'

/** Typed characters before the catalogue is searched: fewer match half of it. */
export const SEARCH_FROM = 3
/** Rows under the field: as many as fit between it and the keyboard on a small phone. */
export const SUGGESTIONS_MAX = 3

export type Suggestions =
  /** Nothing typed yet: the popular ones, as the sheet used to open with. */
  | { kind: 'popular'; products: HealthProduct[] }
  /** One or two letters: too few to search, the field says so. */
  | { kind: 'typing' }
  | { kind: 'results'; products: HealthProduct[] }
  /** Searched and not found: what was typed is kept as the owner's own name. */
  | { kind: 'nothing' }

/**
 * What the product field offers under itself for what has been typed.
 *
 * The search is the shared one (case, «ё» and keyboard layout do not matter),
 * so «нобив», «НОБИВ» and «yj,bd» all find Нобивак, as on the site.
 */
export function suggestProducts(products: readonly HealthProduct[], typed: string): Suggestions {
  const query = typed.trim()
  if (query === '') {
    return { kind: 'popular', products: products.filter((product) => product.popular).slice(0, SUGGESTIONS_MAX) }
  }
  if (query.length < SEARCH_FROM) return { kind: 'typing' }
  const found = products.filter((product) => matchesCatalog(product, query))
  return found.length > 0 ? { kind: 'results', products: found.slice(0, SUGGESTIONS_MAX) } : { kind: 'nothing' }
}
