/**
 * Line icons of web concept 01. Decorative by default: the text next to an
 * icon names the action, so screen readers skip the drawing.
 */
const PATHS = {
  paw: (
    <>
      <ellipse cx="5" cy="9" rx="2" ry="2.6" />
      <ellipse cx="10" cy="5" rx="2" ry="2.6" />
      <ellipse cx="15" cy="5" rx="2" ry="2.6" />
      <ellipse cx="20" cy="9" rx="2" ry="2.6" />
      <path d="M7 14q5-7 10 0c7 9-3 5-5 5s-12 4-5-5Z" />
    </>
  ),
  home: <path d="m3 10 9-7 9 7v11H3Z M9 21v-8h6v8" />,
  check: (
    <>
      <rect x="5" y="4" width="14" height="18" rx="3" />
      <path d="M9 4V2h6v2M8 13l3 3 5-6" />
    </>
  ),
  history: <path d="M3 10a9 9 0 1 1 0 5M3 3v7h7M12 7v5l3 2" />,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  back: <path d="M20 12H4m6-6-6 6 6 6" />,
  plus: <path d="M12 4v16M4 12h16" />,
  heart: <path d="M12 21S2 15 2 8c0-6 8-6 10-1 2-5 10-5 10 1 0 7-10 13-10 13Z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-10v1" />
    </>
  ),
  logout: <path d="M9 3H3v18h6m6-14 5 5-5 5M8 12h12" />,
  user: (
    <>
      <circle cx="12" cy="7" r="4" />
      <path d="M4 22v-3a8 8 0 0 1 16 0v3" />
    </>
  ),
  shield: <path d="m12 2 8 3v7c0 6-8 10-8 10S4 18 4 12V5Zm-4 9 3 3 5-6" />,
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M2 12s4-7 10-7c2.2 0 4.1.9 5.6 2M22 12s-4 7-10 7c-2.2 0-4.1-.9-5.6-2" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
    </>
  ),
  chart: <path d="M4 3v18h18M8 16l4-7 4 4 5-8" />,
} as const

export type IconName = keyof typeof PATHS

export default function Icon({
  name,
  className,
  label,
}: {
  name: IconName
  className?: string
  /** Only for an icon that stands alone, with no text beside it. */
  label?: string
}) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      viewBox="0 0 24 24"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
