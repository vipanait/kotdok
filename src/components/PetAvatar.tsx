import type { PetSpecies } from '@/shared/types'

interface Props {
  /** Outer diameter in px. Defaults to 40. */
  size?: number
  /** Background tint. Defaults to a peach that matches the cabinet design. */
  bg?: string
  species?: PetSpecies
  className?: string
}

/**
 * Round avatar with a stylised flat cat or dog face.
 */
export default function PetAvatar({ size = 40, bg = '#F4DDB7', species = 'cat', className }: Props) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${className ?? ''}`}
      style={{ width: size, height: size, background: bg }}
      aria-hidden
    >
      {species === 'dog' ? <DogFace size={size} /> : <CatFace size={size} />}
    </span>
  )
}

function CatFace({ size }: { size: number }) {
  return (
    <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 32 32" fill="none">
      <path
        d="M6.4 9.5 L10.2 4.5 L13.5 10 H18.5 L21.8 4.5 L25.6 9.5 V18.2 C25.6 23.4 21.5 27 16 27 C10.5 27 6.4 23.4 6.4 18.2 Z"
        fill="#FC7A00"
      />
      <circle cx="12.4" cy="17" r="1.05" fill="#FFFFFF" />
      <circle cx="19.6" cy="17" r="1.05" fill="#FFFFFF" />
      <path d="M16 19.4 L15 20.4 L17 20.4 Z" fill="#FFFFFF" />
      <path
        d="M14.6 21.5 Q16 23 17.4 21.5"
        stroke="#FFFFFF"
        strokeWidth="0.9"
        strokeLinecap="round"
        fill="none"
      />
      <g stroke="#FFFFFF" strokeWidth="0.6" strokeLinecap="round">
        <line x1="9" y1="19" x2="11.2" y2="19.5" />
        <line x1="9" y1="20.4" x2="11.2" y2="20.4" />
        <line x1="23" y1="19" x2="20.8" y2="19.5" />
        <line x1="23" y1="20.4" x2="20.8" y2="20.4" />
      </g>
    </svg>
  )
}

function DogFace({ size }: { size: number }) {
  return (
    <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 32 32" fill="none">
      {/* Ears */}
      <ellipse cx="7.5" cy="12" rx="3.2" ry="5.2" fill="#C45A12" transform="rotate(-18 7.5 12)" />
      <ellipse cx="24.5" cy="12" rx="3.2" ry="5.2" fill="#C45A12" transform="rotate(18 24.5 12)" />
      {/* Head */}
      <ellipse cx="16" cy="17.5" rx="9.5" ry="8.5" fill="#E07A2F" />
      {/* Snout */}
      <ellipse cx="16" cy="21.2" rx="4.2" ry="3.2" fill="#F4C28A" />
      {/* Eyes */}
      <circle cx="12.2" cy="16.2" r="1.15" fill="#FFFFFF" />
      <circle cx="19.8" cy="16.2" r="1.15" fill="#FFFFFF" />
      <circle cx="12.4" cy="16.4" r="0.45" fill="#3A2518" />
      <circle cx="20" cy="16.4" r="0.45" fill="#3A2518" />
      {/* Nose */}
      <ellipse cx="16" cy="20.2" rx="1.3" ry="1" fill="#3A2518" />
      {/* Mouth */}
      <path
        d="M14.2 22.2 Q16 24 17.8 22.2"
        stroke="#3A2518"
        strokeWidth="0.8"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
