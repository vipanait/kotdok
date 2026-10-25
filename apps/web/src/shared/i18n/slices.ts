import type { Dictionary } from './dictionaries/ru'

/**
 * Which texts reach the browser on which route.
 *
 * The dictionary of the active language used to go whole to every page's
 * client components — the medical record's 30 KB on the landing page. The
 * core (everything not named below) goes with the root layout to every
 * page; each route group's layout adds the slice its screens read through
 * `useTranslations()` (`<DictionarySlice route="…">`). Server components
 * are not concerned: they read the whole dictionary on the server.
 *
 * `tests/server/architecture/dictionary-slices.test.ts` walks every page's
 * imports and checks the route provides what its client components read.
 */
export type Namespace = keyof Dictionary

export const ROUTE_SLICES = {
  /** The overview: the follow-up banners and the first-entry welcome. */
  '(app)': ['check', 'followup', 'onboarding'],
  '(auth)': ['auth'],
  /** The pet form and the first steps; the record is a group below. */
  pets: ['pets', 'onboarding', 'firstSteps'],
  'pets/[id]': ['medicalRecord', 'followup'],
  check: ['check', 'followup'],
  checks: ['check', 'followup'],
  admin: ['admin'],
  'account-deletion': ['deletion'],
  credits: ['credits'],
} as const satisfies Record<string, readonly Namespace[]>

export type SliceRoute = keyof typeof ROUTE_SLICES

/** Everything some route group provides for itself, and the root therefore does not. */
export const SLICED: ReadonlySet<Namespace> = new Set<Namespace>(Object.values(ROUTE_SLICES).flat())

/** What every page's client components get. */
export function coreOf(dict: Dictionary): Partial<Dictionary> {
  const core: Partial<Dictionary> = {}
  for (const name of Object.keys(dict) as Namespace[]) {
    if (!SLICED.has(name)) (core as Record<string, unknown>)[name] = dict[name]
  }
  return core
}

/** The namespaces one route group adds. */
export function sliceOf(dict: Dictionary, route: SliceRoute): Partial<Dictionary> {
  const slice: Partial<Dictionary> = {}
  for (const name of ROUTE_SLICES[route]) (slice as Record<string, unknown>)[name] = dict[name]
  return slice
}

/** A nested provider's slice over what the page already has. */
export function mergeSlices(parent: Partial<Dictionary> | null, slice: Partial<Dictionary>): Partial<Dictionary> {
  return parent ? { ...parent, ...slice } : slice
}
