import { useSyncExternalStore } from 'react'

/** Chromium prints the `@page` margin boxes from this version on (Chrome 131, November 2024). */
const FIRST_CHROMIUM_WITH_MARGIN_BOXES = 131

type Brand = { brand: string; version: string }

/**
 * Whether this browser prints the footer the summary writes into the page
 * margins (`@bottom-left`, VetSummaryScreen). No CSS query can ask that, so
 * the engine is asked instead: Chromium 131+ says so through its user-agent
 * brands. Safari and Firefox have no brands and are answered «no» — they
 * keep the footer at the end of the summary, and the disclaimer is never
 * lost; the worst a wrong «no» does is print the footer twice (MW-07).
 */
export function printsPageMargins(brands: readonly Brand[] | undefined): boolean {
  return (brands ?? []).some((item) => item.brand === 'Chromium' && Number.parseInt(item.version, 10) >= FIRST_CHROMIUM_WITH_MARGIN_BOXES)
}

function browserBrands(): readonly Brand[] | undefined {
  return (navigator as Navigator & { userAgentData?: { brands?: readonly Brand[] } }).userAgentData?.brands
}

const unchanging = () => () => {}

/** `printsPageMargins` for this browser; «no» while rendering on the server. */
export function usePrintsPageMargins(): boolean {
  return useSyncExternalStore(
    unchanging,
    () => printsPageMargins(browserBrands()),
    () => false,
  )
}
