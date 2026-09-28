import type { HealthProduct } from '@lapka/contracts'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'

/**
 * What the catalogue combobox lists, apart from React. On focus with nothing
 * typed: the popular products first, at most {@link POPULAR_SHOWN}; with a
 * query: what the server found. The two ways out come last, always.
 */

export const POPULAR_SHOWN = 8
/** A search lists this many; the rest are found by typing more. */
export const FOUND_SHOWN = 20

export type CatalogOption =
  | { type: 'product'; key: string; product: HealthProduct }
  | { type: 'manual'; key: 'manual' }
  | { type: 'none'; key: 'none' }

export function catalogOptions(products: readonly HealthProduct[], query: string): CatalogOption[] {
  const shown =
    query.trim() === ''
      ? [...products.filter((product) => product.popular), ...products.filter((product) => !product.popular)].slice(0, POPULAR_SHOWN)
      : products.slice(0, FOUND_SHOWN)
  return [
    ...shown.map((product) => ({ type: 'product' as const, key: product.id, product })),
    { type: 'manual', key: 'manual' },
    { type: 'none', key: 'none' },
  ]
}

function targetWord(dict: Dictionary, code: string): string {
  const words = dict.medicalRecord
  return (words.targets as Record<string, string>)[code] ?? (words.parasiteTargets as Record<string, string>)[code] ?? code
}

/** «MSD · Инъекция · панлейкопения, калицивироз, ринотрахеит»: who makes it, the form, what it covers. */
export function productDetail(dict: Dictionary, product: HealthProduct): string {
  const forms = dict.medicalRecord.catalog.forms as Record<string, string>
  const covers = product.targets.map((code) => targetWord(dict, code).toLowerCase()).join(', ')
  return [product.manufacturer, product.form ? (forms[product.form] ?? product.form) : null, covers]
    .filter((part): part is string => !!part && part.trim() !== '')
    .join(' · ')
}
