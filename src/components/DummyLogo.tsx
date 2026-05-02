interface Props {
  width?: number
  height?: number
  className?: string
  /** Show wordmark next to the icon. Defaults to true. */
  withWordmark?: boolean
}

export default function DummyLogo({ width = 160, height = 56, className, withWordmark = true }: Props) {
  return (
    <svg
      width={withWordmark ? width : height}
      height={height}
      viewBox={withWordmark ? '0 0 240 84' : '0 0 84 84'}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Dummy"
      role="img"
    >
      <defs>
        <linearGradient id="dummy-gradient" x1="6" y1="20" x2="78" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#36C0FF" />
          <stop offset="1" stopColor="#34D8B8" />
        </linearGradient>
      </defs>

      {/* Card outline */}
      <rect
        x="6"
        y="20"
        width="72"
        height="44"
        rx="9"
        ry="9"
        fill="none"
        stroke="url(#dummy-gradient)"
        strokeWidth="3.5"
      />

      {/* Bottom-left dash on the card chip */}
      <rect x="16" y="50" width="14" height="3.5" rx="1.75" fill="url(#dummy-gradient)" />

      {/* Plus inside card */}
      <g stroke="url(#dummy-gradient)" strokeWidth="3.5" strokeLinecap="round">
        <line x1="55" y1="36" x2="55" y2="52" />
        <line x1="47" y1="44" x2="63" y2="44" />
      </g>

      {withWordmark && (
        <text
          x="92"
          y="56"
          fill="#0F2A66"
          fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
          fontWeight="700"
          fontSize="36"
          letterSpacing="-0.5"
        >
          Dummy
        </text>
      )}
    </svg>
  )
}
