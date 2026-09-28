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
  close: <path d="M6 6l12 12M18 6 6 18" />,
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
  // Medical record (docs/design/medical-record-web-v1).
  vaccine: <path d="m14 3 7 7m-9-5 7 7M5 12l7-7 7 7-7 7H5v-7ZM3 21l3-3m3-8 3 3m-6 0 3 3" />,
  parasite: <path d="M12 2S4 11 4 15a8 8 0 0 0 16 0c0-4-8-13-8-13Z" />,
  visit: (
    <>
      <path d="M4 3v6a5 5 0 0 0 10 0V3M2 3h4m6 0h4M9 14v2a5 5 0 0 0 10 0v-3" />
      <circle cx="19" cy="10" r="3" />
    </>
  ),
  medicine: <path d="m8 4-4 4a6 6 0 0 0 8 12l8-8a6 6 0 0 0-8-8Zm-3 7 8 8" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M7 3v4m10-4v4M3 10h18" />
    </>
  ),
  calendarLate: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M7 3v4m10-4v4M3 10h18m-9 3v3m0 2h.01" />
    </>
  ),
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
