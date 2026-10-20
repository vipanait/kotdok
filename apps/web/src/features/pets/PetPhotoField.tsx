'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from '@/components/LocaleProvider'
import PetAvatar from '@/components/PetAvatar'
import Icon from '@/components/ui/Icon'
import type { PetSpecies } from '@/shared/types'
import { photoProblem, type PhotoChange } from './pet-photo'
import { preparePhoto } from './prepare-photo'

/**
 * «Добавить фото» in the pet form (design `pet-form`): optional. The picked
 * picture is shown at once and goes to the server only with «Сохранить»;
 * a photo the pet has can be replaced or removed the same way. The owner's
 * photo wins over the species drawing wherever the pet is shown.
 */
export default function PetPhotoField({
  species,
  photoUrl,
  change,
  onChange,
}: {
  species: PetSpecies
  /** The pet's current photo, a signed link; none for a new pet. */
  photoUrl: string | null
  change: PhotoChange
  onChange: (change: PhotoChange) => void
}) {
  const t = useTranslations().pets.photo
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [problem, setProblem] = useState<string>('')
  const [reading, setReading] = useState(false)

  // The preview's object URL lives as long as it is shown.
  useEffect(() => {
    if (change.kind !== 'set') {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(change.photo.blob)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [change])

  const shown = change.kind === 'set' ? preview : change.kind === 'remove' ? null : photoUrl
  const hasPhoto = shown !== null

  async function pick(file: File | undefined) {
    if (!file) return
    setProblem('')
    if (photoProblem(file)) {
      setProblem(t.typeError)
      return
    }
    setReading(true)
    try {
      onChange({ kind: 'set', photo: await preparePhoto(file) })
    } catch {
      setProblem(t.readError)
    } finally {
      setReading(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="pet-photo-field">
      <PetAvatar size={84} species={species} photoUrl={shown} />
      <div>
        <div className="pet-photo-actions">
          <input
            ref={input}
            id={`${id}-file`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            // Opened by the visible button: not a tab stop of its own with no visible focus.
            tabIndex={-1}
            aria-describedby={`${id}-note${problem ? ` ${id}-problem` : ''}`}
            onChange={(event) => void pick(event.target.files?.[0])}
          />
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              if (!reading) input.current?.click()
            }}
            aria-disabled={reading || undefined}
          >
            <Icon name="plus" />
            {hasPhoto ? t.replace : t.add}
          </button>
          {hasPhoto && (
            <button type="button" className="link danger" onClick={() => onChange(photoUrl && change.kind !== 'remove' ? { kind: 'remove' } : { kind: 'keep' })}>
              {t.remove}
            </button>
          )}
          {!hasPhoto && change.kind === 'remove' && (
            <button type="button" className="link" onClick={() => onChange({ kind: 'keep' })}>
              {t.undoRemove}
            </button>
          )}
        </div>
        <small id={`${id}-note`} className="field-hint">
          {change.kind === 'remove' ? t.willRemove : t.note}
        </small>
        {problem && (
          <span id={`${id}-problem`} className="field-error" role="alert">
            {problem}
          </span>
        )}
      </div>
    </div>
  )
}
