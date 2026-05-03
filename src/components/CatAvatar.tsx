interface Props {
  /** Outer diameter in px. Defaults to 40. */
  size?: number
  /** Background tint. Defaults to a peach that matches the cabinet design. */
  bg?: string
  className?: string
}

/**
 * Round avatar with a stylised orange cat face. Used in the dashboard "My cats"
 * list, the symptom-check modal selected-pet card, and the cat profile form.
 */
export default function CatAvatar({ size = 40, bg = '#F4DDB7', className }: Props) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${className ?? ''}`}
      style={{ width: size, height: size, background: bg }}
      aria-hidden
    >
      <svg
        width={size * 0.62}
        height={size * 0.62}
        viewBox="0 0 32 32"
        fill="none"
        stroke="#FC7A00"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* ears */}
        <path d="M7 8 L11 4 L13 11 Z" />
        <path d="M25 8 L21 4 L19 11 Z" />
        {/* head */}
        <path d="M5 14 C5 22 10 28 16 28 C22 28 27 22 27 14 C27 11 26 9 25 8 L7 8 C6 9 5 11 5 14 Z" />
        {/* eyes */}
        <line x1="12" y1="17" x2="13" y2="18" />
        <line x1="20" y1="17" x2="19" y2="18" />
        {/* nose + mouth */}
        <path d="M16 20 L15.2 21 L16 21.6 L16.8 21 Z" fill="#FC7A00" />
        <path d="M16 22 L14.8 23.5" />
        <path d="M16 22 L17.2 23.5" />
        {/* whiskers */}
        <line x1="9" y1="20" x2="13" y2="21" />
        <line x1="23" y1="20" x2="19" y2="21" />
      </svg>
    </span>
  )
}
