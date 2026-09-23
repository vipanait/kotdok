'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Pet, PetSizeClass, PetSpecies, PetWalkActivity } from '@/shared/types'
import { useTranslations } from '@/components/LocaleProvider'
import PetAvatar from '@/components/PetAvatar'
import Icon from '@/components/ui/Icon'
import ConfirmDialog from '@/features/pets/ConfirmDialog'
import type { PetSavedKind } from '@/features/pets/PetSavedBanner'
import { csrfHeaders } from '@/shared/security/csrf-client'

type PetFormValues = Omit<Pet, 'id' | 'user_id' | 'created_at'>

interface Props {
  /** The pet being edited; none for a new one. */
  pet?: Pet
}

/** Where the form leads after a save or a delete, with the confirmation banner. */
const LIST_HREF = '/pets'
const savedHref = (kind: PetSavedKind) => `${LIST_HREF}?petSaved=${kind}`

const NOTES_MAX = 300

function toArr(val: string): string[] {
  return val.split(',').map(s => s.trim()).filter(Boolean)
}

function fromArr(arr: string[]): string {
  return arr.join(', ')
}

function sanitizeDecimalInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.,]/g, '')
  const sepIndex = cleaned.search(/[.,]/)
  if (sepIndex === -1) return cleaned
  const intPart = cleaned.slice(0, sepIndex)
  const sep = cleaned[sepIndex]
  const frac = cleaned.slice(sepIndex + 1).replace(/[.,]/g, '')
  return intPart + sep + frac
}

function parseDecimal(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (normalized === '') return null
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

/**
 * The pet profile as a page: a sectioned form on the left, context on the
 * right. Leaving with unsaved changes — any link on the page, a reload or
 * closing the tab — asks first. Delete is set apart and confirmed in a dialog.
 */
export default function PetForm({ pet }: Props) {
  const router = useRouter()
  const dict = useTranslations()
  const t = dict.pets
  const isEdit = !!pet
  const formId = useId()
  const notesTitleId = `${formId}-notes-title`
  const notesCountId = `${formId}-notes-count`
  const nameErrorId = `${formId}-name-error`
  const fieldId = (name: string) => `${formId}-${name}`

  const [species, setSpecies] = useState<PetSpecies>(pet?.species ?? 'cat')
  const [name, setName] = useState(pet?.name ?? '')
  const [breed, setBreed] = useState(pet?.breed ?? '')
  const [ageYears, setAgeYears] = useState(pet?.age_years?.toString() ?? '')
  const [weightKg, setWeightKg] = useState(pet?.weight_kg?.toString() ?? '')
  const [sex, setSex] = useState<Pet['sex']>(pet?.sex ?? null)
  const [neutered, setNeutered] = useState<boolean | null>(pet?.neutered ?? null)
  const [indoorOutdoor, setIndoorOutdoor] = useState<Pet['indoor_outdoor']>(pet?.indoor_outdoor ?? null)
  const [diet, setDiet] = useState<Pet['diet']>(pet?.diet ?? null)
  const [sizeClass, setSizeClass] = useState<PetSizeClass | null>(pet?.size_class ?? null)
  const [walkActivity, setWalkActivity] = useState<PetWalkActivity | null>(pet?.walk_activity ?? null)
  const [allergies, setAllergies] = useState(fromArr(pet?.allergies ?? []))
  const [vaccinated, setVaccinated] = useState<boolean | null>(pet?.vaccinated ?? null)
  const [chronicConditions, setChronicConditions] = useState(fromArr(pet?.chronic_conditions ?? []))
  const [medications, setMedications] = useState(fromArr(pet?.medications ?? []))
  const [notes, setNotes] = useState(pet?.notes ?? '')

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [nameError, setNameError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [leaveHref, setLeaveHref] = useState<string | null>(null)

  const nameRef = useRef<HTMLInputElement>(null)
  const deleteButtonRef = useRef<HTMLButtonElement>(null)
  const leaveLinkRef = useRef<HTMLElement | null>(null)
  /** Set once the form is done — saved, deleted or abandoned on purpose. */
  const leavingRef = useRef(false)

  const sexFemale = species === 'dog' ? t.sexFemaleDog : t.sexFemaleCat
  const sexMale = species === 'dog' ? t.sexMaleDog : t.sexMaleCat
  const chronicPlaceholder = species === 'dog' ? t.chronicPlaceholderDog : t.chronicPlaceholderCat
  const medicationsPlaceholder = species === 'dog' ? t.medicationsPlaceholderDog : t.medicationsPlaceholderCat
  const namePlaceholder = species === 'dog' ? t.namePlaceholderDog : t.namePlaceholderCat
  const breedPlaceholder = species === 'dog' ? t.breedPlaceholderDog : t.breedPlaceholderCat

  const dirty =
    species !== (pet?.species ?? 'cat') ||
    name !== (pet?.name ?? '') ||
    breed !== (pet?.breed ?? '') ||
    ageYears !== (pet?.age_years?.toString() ?? '') ||
    weightKg !== (pet?.weight_kg?.toString() ?? '') ||
    sex !== (pet?.sex ?? null) ||
    neutered !== (pet?.neutered ?? null) ||
    indoorOutdoor !== (pet?.indoor_outdoor ?? null) ||
    diet !== (pet?.diet ?? null) ||
    sizeClass !== (pet?.size_class ?? null) ||
    walkActivity !== (pet?.walk_activity ?? null) ||
    allergies !== fromArr(pet?.allergies ?? []) ||
    vaccinated !== (pet?.vaccinated ?? null) ||
    chronicConditions !== fromArr(pet?.chronic_conditions ?? []) ||
    medications !== fromArr(pet?.medications ?? []) ||
    notes !== (pet?.notes ?? '')

  // Unsaved changes: the browser asks on reload or closing the tab; a link
  // anywhere on the page (the back link, "Cancel", the cabinet navigation)
  // opens our own dialog first. Captured on window, before next/link acts.
  useEffect(() => {
    if (!dirty) return

    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (leavingRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }

    function onClick(e: MouseEvent) {
      if (leavingRef.current || e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.hasAttribute('download')) return
      if (anchor.target && anchor.target !== '_self') return

      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return

      e.preventDefault()
      leaveLinkRef.current = anchor
      setLeaveHref(url.pathname + url.search + url.hash)
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('click', onClick, true)
    }
  }, [dirty])

  function leave(href: string) {
    leavingRef.current = true
    router.push(href)
    router.refresh()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!name.trim()) {
      setNameError(t.errorName)
      nameRef.current?.focus()
      return
    }
    setSaving(true)
    setFormError('')
    setNameError('')

    const body: PetFormValues = {
      species,
      name: name.trim(),
      breed: breed.trim() || null,
      age_years: parseDecimal(ageYears),
      weight_kg: parseDecimal(weightKg),
      sex,
      neutered,
      indoor_outdoor: indoorOutdoor,
      diet,
      size_class: species === 'dog' ? sizeClass : null,
      walk_activity: species === 'dog' ? walkActivity : null,
      allergies: toArr(allergies),
      vaccinated,
      chronic_conditions: toArr(chronicConditions),
      medications: toArr(medications),
      notes: notes.trim() || null,
    }

    const url = isEdit ? `/api/pets/${pet!.id}` : '/api/pets'
    const method = isEdit ? 'PUT' : 'POST'
    try {
      const res = await fetch(url, {
        method,
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        setFormError(t.saveError)
        setSaving(false)
        return
      }
    } catch {
      setFormError(t.saveError)
      setSaving(false)
      return
    }

    leave(savedHref(isEdit ? 'updated' : 'created'))
  }

  async function handleDelete() {
    if (!pet || deleting) return
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/pets/${pet.id}`, { method: 'DELETE', headers: csrfHeaders() })
      if (!res.ok) {
        setDeleteError(t.deleteError)
        setDeleting(false)
        return
      }
    } catch {
      setDeleteError(t.deleteError)
      setDeleting(false)
      return
    }
    leave(savedHref('deleted'))
  }

  return (
    <div className="form-layout">
      <form className="card pet-form" onSubmit={handleSubmit} noValidate aria-busy={saving || undefined}>
        <section className="form-section">
          <h3>{t.sectionBasic}</h3>
          <div className="form-grid">
            <Field id={fieldId('species')} label={t.species}>
              <select
                id={fieldId('species')}
                value={species}
                onChange={e => {
                  const value = e.target.value as PetSpecies
                  setSpecies(value)
                  if (value !== 'dog') {
                    setSizeClass(null)
                    setWalkActivity(null)
                  }
                }}
                className="input"
              >
                <option value="cat">{t.speciesCat}</option>
                <option value="dog">{t.speciesDog}</option>
              </select>
            </Field>

            <Field id={fieldId('name')} label={t.name} error={nameError} errorId={nameErrorId}>
              <input
                ref={nameRef}
                id={fieldId('name')}
                value={name}
                onChange={e => { setName(e.target.value); if (nameError) setNameError('') }}
                placeholder={namePlaceholder}
                className="input"
                autoComplete="off"
                aria-required="true"
                aria-invalid={!!nameError || undefined}
                aria-describedby={nameError ? nameErrorId : undefined}
              />
            </Field>

            <Field id={fieldId('breed')} label={t.breed}>
              <input
                id={fieldId('breed')}
                value={breed}
                onChange={e => setBreed(e.target.value)}
                placeholder={breedPlaceholder}
                className="input"
                autoComplete="off"
              />
            </Field>

            <Field id={fieldId('age')} label={t.ageYears}>
              <input
                id={fieldId('age')}
                type="text"
                inputMode="decimal"
                value={ageYears}
                onChange={e => setAgeYears(sanitizeDecimalInput(e.target.value))}
                placeholder="3"
                className="input"
                autoComplete="off"
              />
            </Field>

            <Field id={fieldId('weight')} label={t.weightKg}>
              <input
                id={fieldId('weight')}
                type="text"
                inputMode="decimal"
                value={weightKg}
                onChange={e => setWeightKg(sanitizeDecimalInput(e.target.value))}
                placeholder="4.5"
                className="input"
                autoComplete="off"
              />
            </Field>

            <Field id={fieldId('sex')} label={t.sex}>
              <select
                id={fieldId('sex')}
                value={sex ?? ''}
                onChange={e => setSex((e.target.value || null) as Pet['sex'])}
                className={selectCls(!sex)}
              >
                <option value="">{dict.common.notSpecifiedM}</option>
                <option value="female">{sexFemale}</option>
                <option value="male">{sexMale}</option>
              </select>
            </Field>
          </div>
        </section>

        <section className="form-section">
          <h3>{t.sectionHealth}</h3>
          <div className="form-grid">
            <Field id={fieldId('neutered')} label={t.neutered}>
              <select
                id={fieldId('neutered')}
                value={neutered == null ? '' : neutered ? 'yes' : 'no'}
                onChange={e => setNeutered(e.target.value === '' ? null : e.target.value === 'yes')}
                className={selectCls(neutered == null)}
              >
                <option value="">{dict.common.notSpecified}</option>
                <option value="yes">{dict.common.yes}</option>
                <option value="no">{dict.common.no}</option>
              </select>
            </Field>

            <Field id={fieldId('vaccinated')} label={t.vaccination}>
              <select
                id={fieldId('vaccinated')}
                value={vaccinated == null ? '' : vaccinated ? 'yes' : 'no'}
                onChange={e => setVaccinated(e.target.value === '' ? null : e.target.value === 'yes')}
                className={selectCls(vaccinated == null)}
              >
                <option value="">{dict.common.notSpecified}</option>
                <option value="yes">{t.vaccinationYes}</option>
                <option value="no">{t.vaccinationNo}</option>
              </select>
            </Field>

            <Field id={fieldId('allergies')} label={t.allergies}>
              <input
                id={fieldId('allergies')}
                value={allergies}
                onChange={e => setAllergies(e.target.value)}
                placeholder={t.allergiesPlaceholder}
                className="input"
                autoComplete="off"
              />
            </Field>

            <Field id={fieldId('chronic')} label={t.chronicConditions}>
              <input
                id={fieldId('chronic')}
                value={chronicConditions}
                onChange={e => setChronicConditions(e.target.value)}
                placeholder={chronicPlaceholder}
                className="input"
                autoComplete="off"
              />
            </Field>

            <Field id={fieldId('medications')} label={t.medications}>
              <input
                id={fieldId('medications')}
                value={medications}
                onChange={e => setMedications(e.target.value)}
                placeholder={medicationsPlaceholder}
                className="input"
                autoComplete="off"
              />
            </Field>
          </div>
        </section>

        <section className="form-section">
          <h3>{t.sectionLifestyle}</h3>
          <div className="form-grid">
            <Field id={fieldId('lifestyle')} label={t.lifestyle}>
              <select
                id={fieldId('lifestyle')}
                value={indoorOutdoor ?? ''}
                onChange={e => setIndoorOutdoor((e.target.value || null) as Pet['indoor_outdoor'])}
                className={selectCls(!indoorOutdoor)}
              >
                <option value="">{dict.common.notSpecifiedM}</option>
                <option value="indoor">{t.lifestyleIndoor}</option>
                <option value="outdoor">{t.lifestyleOutdoor}</option>
                <option value="both">{t.lifestyleBoth}</option>
              </select>
            </Field>

            <Field id={fieldId('diet')} label={t.diet}>
              <select
                id={fieldId('diet')}
                value={diet ?? ''}
                onChange={e => setDiet((e.target.value || null) as Pet['diet'])}
                className={selectCls(!diet)}
              >
                <option value="">{dict.common.notSpecified}</option>
                <option value="dry">{t.dietDry}</option>
                <option value="wet">{t.dietWet}</option>
                <option value="mixed">{t.dietMixed}</option>
                <option value="raw">{t.dietRaw}</option>
              </select>
            </Field>

            {species === 'dog' && (
              <>
                <Field id={fieldId('size')} label={t.sizeClass}>
                  <select
                    id={fieldId('size')}
                    value={sizeClass ?? ''}
                    onChange={e => setSizeClass((e.target.value || null) as PetSizeClass | null)}
                    className={selectCls(!sizeClass)}
                  >
                    <option value="">{dict.common.notSpecifiedM}</option>
                    <option value="toy">{t.sizeToy}</option>
                    <option value="small">{t.sizeSmall}</option>
                    <option value="medium">{t.sizeMedium}</option>
                    <option value="large">{t.sizeLarge}</option>
                    <option value="giant">{t.sizeGiant}</option>
                  </select>
                </Field>

                <Field id={fieldId('walks')} label={t.walkActivity}>
                  <select
                    id={fieldId('walks')}
                    value={walkActivity ?? ''}
                    onChange={e => setWalkActivity((e.target.value || null) as PetWalkActivity | null)}
                    className={selectCls(!walkActivity)}
                  >
                    <option value="">{dict.common.notSpecifiedM}</option>
                    <option value="rare">{t.walkRare}</option>
                    <option value="daily_short">{t.walkDailyShort}</option>
                    <option value="daily_long">{t.walkDailyLong}</option>
                    <option value="sport">{t.walkSport}</option>
                  </select>
                </Field>
              </>
            )}
          </div>
        </section>

        <section className="form-section">
          {/* The heading is the textarea's only label: "Notes" is written once. */}
          <h3 id={notesTitleId}>{t.sectionNotes}</h3>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value.slice(0, NOTES_MAX))}
            placeholder={t.notesPlaceholder}
            rows={4}
            maxLength={NOTES_MAX}
            className="input"
            aria-labelledby={notesTitleId}
            aria-describedby={notesCountId}
          />
          <p
            id={notesCountId}
            className={notes.length >= NOTES_MAX ? 'notes-counter is-max' : 'notes-counter'}
          >
            {notes.length}/{NOTES_MAX}
          </p>
        </section>

        {formError && <p role="alert" className="banner error form-error">{formError}</p>}

        <div className="form-actions">
          {isEdit ? (
            <button
              ref={deleteButtonRef}
              type="button"
              className="btn danger"
              onClick={() => { setDeleteError(''); setConfirmDelete(true) }}
              disabled={deleting || saving}
            >
              {t.deletePet}
            </button>
          ) : null}
          <div className="row">
            <Link href={LIST_HREF} className="link">{t.cancelBtn}</Link>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? t.savingBtn : isEdit ? t.saveBtn : t.addBtn}
            </button>
          </div>
        </div>
      </form>

      <aside className="summary-box pet-form-aside">
        <PetAvatar species={species} />
        <h3>{t.asideTitle}</h3>
        <p>{t.asideBody}</p>
        <div className="divider" />
        <p>{t.asideNote}</p>
        {isEdit && (
          <Link href="/checks" className="link">
            {t.asideHistory}
            <Icon name="arrow" />
          </Link>
        )}
      </aside>

      {confirmDelete && pet && (
        <ConfirmDialog
          title={t.confirmDeleteTitle.replace('{name}', pet.name)}
          body={t.confirmDeleteBody}
          cancelLabel={t.cancelBtn}
          confirmLabel={t.deleteBtn}
          busyLabel={t.deletingBtn}
          busy={deleting}
          error={deleteError}
          tone="danger"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
          returnFocusRef={deleteButtonRef}
        />
      )}

      {leaveHref && (
        <ConfirmDialog
          title={t.leaveTitle}
          body={t.leaveBody}
          cancelLabel={t.leaveStay}
          confirmLabel={t.leaveConfirm}
          onCancel={() => setLeaveHref(null)}
          onConfirm={() => leave(leaveHref)}
          returnFocusRef={leaveLinkRef}
        />
      )}
    </div>
  )
}

function selectCls(empty: boolean) {
  return empty ? 'input is-empty' : 'input'
}

function Field({
  id,
  label,
  children,
  error,
  errorId,
}: {
  id: string
  label: string
  children: React.ReactNode
  error?: string
  errorId?: string
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      {children}
      {error && <span id={errorId} className="field-error" role="alert">{error}</span>}
    </div>
  )
}
