'use client'

import { useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DOCUMENT_KINDS, DOCUMENT_LIMITS, type DocumentKind, type DocumentPatch, type PetDocument } from '@lapka/contracts'
import { apiFailure } from '@lapka/shared'
import { useTranslations } from '@/components/LocaleProvider'
import { browserApi } from '@/features/api/browser-api'

/**
 * «Название и дата», under the disclosure of a document's page: its name, kind and date, changed in place. Only what
 * changed is sent; a name once given can be changed but not emptied (the
 * API keeps a name of one character at least), and the date is never after
 * the owner's today.
 */
export default function DocumentDetailsForm({
  petId,
  doc,
  today,
  disabled,
  onSaved,
}: {
  petId: string
  doc: PetDocument
  today: string
  disabled: boolean
  onSaved: (doc: PetDocument) => void
}) {
  const dict = useTranslations()
  const words = dict.documents
  const view = words.view
  const router = useRouter()
  const id = useId()
  const [title, setTitle] = useState(doc.title)
  const [kind, setKind] = useState<DocumentKind>(doc.kind)
  const [day, setDay] = useState(doc.document_date ?? '')
  const [errors, setErrors] = useState<{ title?: string; day?: string }>({})
  const [banner, setBanner] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const dayRef = useRef<HTMLInputElement>(null)

  function patch(): DocumentPatch | 'invalid' | null {
    const problems: typeof errors = {}
    const trimmed = title.trim()
    if (!trimmed && doc.title.trim()) problems.title = view.titleRequired
    if (day && day > today) problems.day = view.dateFuture
    if (problems.title || problems.day) {
      setErrors(problems)
      ;(problems.title ? titleRef : dayRef).current?.focus()
      return 'invalid'
    }
    const change: DocumentPatch = {}
    if (trimmed && trimmed !== doc.title) change.title = trimmed
    if (kind !== doc.kind) change.kind = kind
    if ((day || null) !== doc.document_date) change.document_date = day || null
    return Object.keys(change).length ? change : null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (inFlight.current || disabled) return
    setBanner(null)
    const change = patch()
    if (change === 'invalid') return
    setErrors({})
    if (!change) return
    inFlight.current = true
    setSaving(true)
    try {
      const saved = await browserApi().changeDocument(petId, doc.id, change)
      onSaved(saved)
    } catch (error) {
      const failure = apiFailure(error)
      if (failure === 'deleting') {
        router.replace('/account-deletion')
        return
      }
      if (failure !== 'offline') console.warn('[documents] change failed', error)
      setBanner(failure === 'offline' ? words.upload.errors.offline : failure === 'signedOut' ? words.upload.errors.signedOut : view.saveFailed)
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  return (
    <form className="document-details" onSubmit={handleSubmit} noValidate aria-label={view.details} aria-busy={saving || undefined}>
      <div className="field">
        <label className="field-label" htmlFor={`${id}-name`}>{view.titleField}</label>
        <input
          ref={titleRef}
          id={`${id}-name`}
          className="input"
          type="text"
          maxLength={DOCUMENT_LIMITS.titleMax}
          placeholder={words.kinds[kind]}
          value={title}
          readOnly={saving}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? `${id}-name-error` : `${id}-name-hint`}
          onChange={(e) => setTitle(e.target.value)}
        />
        {errors.title ? (
          <span id={`${id}-name-error`} className="field-error" role="alert">{errors.title}</span>
        ) : (
          <span id={`${id}-name-hint`} className="field-hint">{view.titleHint}</span>
        )}
      </div>

      <div className="field">
        <label className="field-label" htmlFor={`${id}-kind`}>{view.kindField}</label>
        <select id={`${id}-kind`} className="input" value={kind} disabled={saving} onChange={(e) => setKind(e.target.value as DocumentKind)}>
          {DOCUMENT_KINDS.map((value) => (
            <option key={value} value={value}>{words.kinds[value]}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="field-label" htmlFor={`${id}-day`}>{view.dateField}</label>
        <input
          ref={dayRef}
          id={`${id}-day`}
          className="input"
          type="date"
          max={today}
          value={day}
          readOnly={saving}
          aria-invalid={errors.day ? true : undefined}
          aria-describedby={[errors.day ? `${id}-day-error` : null, `${id}-day-hint`].filter(Boolean).join(' ')}
          onChange={(e) => setDay(e.target.value)}
        />
        {errors.day && <span id={`${id}-day-error`} className="field-error" role="alert">{errors.day}</span>}
        <span id={`${id}-day-hint`} className="field-hint">{view.dateHint}</span>
      </div>

      {banner && <p className="banner error record-form-error" role="alert">{banner}</p>}

      <div className="form-actions">
        <button type="submit" className="btn secondary" aria-disabled={saving || disabled || undefined}>
          {saving ? view.saving : view.save}
        </button>
      </div>
    </form>
  )
}
