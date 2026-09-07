import { useMemo } from 'react'
import { SvgXml } from 'react-native-svg'
import { colour } from './theme'

/**
 * The concept's icon set, copied path for path out of its prototype.
 *
 * The strings are the design's own, not a redrawing of it, so the two cannot
 * drift: `docs/design/mobile-concept-v1/screens.js`, `const paths`. They are
 * rendered rather than reimplemented in JSX for the same reason — a diff
 * against the source is a diff of one line.
 */
const paths = {
  paw: '<ellipse cx="5" cy="9" rx="2" ry="2.6" transform="rotate(-24 5 9)"/><ellipse cx="9.5" cy="5" rx="2" ry="2.6" transform="rotate(-8 9.5 5)"/><ellipse cx="14.5" cy="5" rx="2" ry="2.6" transform="rotate(8 14.5 5)"/><ellipse cx="19" cy="9" rx="2" ry="2.6" transform="rotate(24 19 9)"/><path d="M7.3 13.8c1.2-1.7 2.5-3.1 4.7-3.1s3.5 1.4 4.7 3.1c1.1 1.5 2.7 3.6 1.6 5.3-1.2 1.7-3.9.3-6.3.3s-5.1 1.4-6.3-.3c-1.1-1.7.5-3.8 1.6-5.3Z"/>',
  back: '<path d="m14 6-6 6 6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  checkup: '<rect x="5" y="4" width="14" height="17" rx="3"/><path d="M9 4V2h6v2m-7 9 3 3 5-6"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2c0-7 16-7 16 0v2"/>',
  eye: '<path d="M2 12c5-8 15-8 20 0-5 8-15 8-20 0Z"/><circle cx="12" cy="12" r="3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 6v7m0 4h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>',
  home: '<path d="m3 11 9-8 9 8M5 10v11h14V10m-10 11v-7h6v7"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  logout: '<path d="M10 3H4v18h6m4-14 5 5-5 5m-5-5h12"/>',
  wifi: '<path d="M3 8c5-4 13-4 18 0M6 12c4-3 8-3 12 0m-9 4c2-1 4-1 6 0m-3 4h.01M3 3l18 18"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-7L3 8m0-5v5h5m4-2v6l4 2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 6 9 7 9-7"/>',
} as const

export type IconName = keyof typeof paths

/**
 * Every icon is stroked, never filled, at 1.7 — the weight the concept picked
 * so a 20 pt icon beside 15 pt text reads as the same ink.
 */
export function Icon({
  name,
  size = 24,
  color = colour.text,
}: {
  name: IconName
  size?: number
  color?: string
}) {
  const xml = useMemo(
    () =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}"` +
      ` stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`,
    [name, color],
  )

  return <SvgXml xml={xml} width={size} height={size} />
}
