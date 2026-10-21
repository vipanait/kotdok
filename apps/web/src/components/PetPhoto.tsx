'use client'

import { useState } from 'react'
import Illustration from '@/components/ui/Illustration'
import type { PetSpecies } from '@/shared/types'

/**
 * The owner's photo of the pet (FB-4), from its short-lived signed link. A
 * link that no longer opens — expired while the page stayed open, or the
 * photo removed on the phone — falls back to the species drawing: a broken
 * image is never shown.
 */
export default function PetPhoto({
  url,
  size,
  species,
  className,
  fixedSize = true,
}: {
  url: string
  size: number
  species?: PetSpecies | null
  className?: string
  /** Pin the box to `size`; off where the stylesheet sizes the avatar. */
  fixedSize?: boolean
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const classes = className ? `avatar pet-photo ${className}` : 'avatar pet-photo'
  if (failedUrl === url) {
    return (
      <Illustration
        name={species === 'dog' ? 'avatar-dog' : 'avatar-cat'}
        size={size}
        className={className ? `avatar ${className}` : 'avatar'}
        fixedSize={fixedSize}
      />
    )
  }
  return (
    // A signed Storage link, different on every read: not something next/image can cache or resize.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      className={classes}
      style={fixedSize ? { width: size, height: size } : undefined}
      decoding="async"
      onError={() => setFailedUrl(url)}
    />
  )
}
