interface Props {
  /** Outer diameter in px. Defaults to 40. */
  size?: number
  /** Background tint. Defaults to a peach that matches the cabinet design. */
  bg?: string
  className?: string
}

/**
 * Round avatar with a stylised flat orange cat face. Used in the dashboard
 * "My pets" list, the symptom-check modal selected-pet card, and on the cat
 * profile form heading.
 */
export default function CatAvatar({ size = 40, bg = '#F4DDB7', className }: Props) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${className ?? ''}`}
      style={{ width: size, height: size, background: bg }}
      aria-hidden
    >
      <svg
        width={size * 0.58}
        height={size * 0.58}
        viewBox="0 0 32 32"
        fill="none"
      >
        {/* Solid orange head + ears */}
        <path
          d="M6.4 9.5 L10.2 4.5 L13.5 10 H18.5 L21.8 4.5 L25.6 9.5 V18.2 C25.6 23.4 21.5 27 16 27 C10.5 27 6.4 23.4 6.4 18.2 Z"
          fill="#FC7A00"
        />
        {/* Eyes */}
        <circle cx="12.4" cy="17" r="1.05" fill="#FFFFFF" />
        <circle cx="19.6" cy="17" r="1.05" fill="#FFFFFF" />
        {/* Nose (small triangle) */}
        <path d="M16 19.4 L15 20.4 L17 20.4 Z" fill="#FFFFFF" />
        {/* Mouth — tiny upward curve */}
        <path
          d="M14.6 21.5 Q16 23 17.4 21.5"
          stroke="#FFFFFF"
          strokeWidth="0.9"
          strokeLinecap="round"
          fill="none"
        />
        {/* Whiskers */}
        <g stroke="#FFFFFF" strokeWidth="0.6" strokeLinecap="round">
          <line x1="9" y1="19" x2="11.2" y2="19.5" />
          <line x1="9" y1="20.4" x2="11.2" y2="20.4" />
          <line x1="23" y1="19" x2="20.8" y2="19.5" />
          <line x1="23" y1="20.4" x2="20.8" y2="20.4" />
        </g>
      </svg>
    </span>
  )
}
