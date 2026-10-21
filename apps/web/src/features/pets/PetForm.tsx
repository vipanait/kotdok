'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import type { Pet, PetSizeClass, PetSpecies, PetWalkActivity } from '@/shared/types'
import { useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { browserApi } from '@/features/api/browser-api'
import { useToday } from '@/features/forms/use-today'
import ConfirmDialog from '@/features/pets/ConfirmDialog'
import { useLeaveGuard } from '@/features/forms/use-leave-guard'
import { petFormCancelHref, petFormDoneHref } from '@/features/pets/pet-form-exit'
import { csrfHeaders } from '@/shared/security/csrf-client'
import { fromArr, petFormRequest } from '@/features/pets/pet-form-request'
import { updateOnboarding } from '@/features/onboarding/onboarding-cookie'
import { chooseGoal, finishOnboarding, type OnboardingGoal } from '@/shared/onboarding/onboarding-state'
import PetDatesFields from './PetDatesFields'
import PetPhotoField from './PetPhotoField'
import { datesFromPet, readPetDates, type PetDatesError, type PetDatesFields as DatesFields } from './pet-dates-form'
import { applyPhoto, type PhotoChange, type PhotoDeps } from './pet-photo'

/**
 * Standing notes under the fields the medical record says more about
 * (spec §4) — «История веса — в медкарте» — already in words; none while the
 * record is empty on that field (`petFormHints`, packages/shared).
 */
export interface PetFormHintTexts {
  weight?: string
  vaccinated?: string
  medications?: string
}

interface Props {
  /** The pet being edited; none for a new one. */
  pet?: Pet
  hints?: PetFormHintTexts
  /** The pet's photo as a signed link, read for this page; none without one. */
  photoUrl?: string | null
  /** The owner's day the page was drawn with (`getOwnerToday`), so both sides render the same dates. */
  today?: string
  /**
   * A new pet's path from the first entry («Проверить симптомы» or «Следить
   * за здоровьем»), and the account it is kept for: the form says where it
   * goes next and goes there once the pet is saved.
   */
  onboarding?: { userId: string; goal: OnboardingGoal | null }
}

const NOTES_MAX = 300

function sanitizeDecimalInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.,]/g, '')
  const sepIndex = cleaned.search(/[.,]/)
  if (sepIndex === -1) return cleaned
  const intPart = cleaned.slice(0, sepIndex)
  const sep = cleaned[sepIndex]
  const frac = cleaned.slice(sepIndex + 1).replace(/[.,]/g, '')
  return intPart + sep + frac
}

/** The photo through the v1 API (Bearer) and straight to storage, as the phone sends it. */
const photoDeps: PhotoDeps = {
  requestAvatar: (petId, body) => browserApi().requestAvatar(petId, body),
  put: async (url, headers, body) => {
    try {
      const response = await fetch(url, { method: 'PUT', headers, body, credentials: 'omit' })
      return response.ok
    } catch {
      return false
    }
  },
  confirmAvatar: (petId, path) => browserApi().confirmAvatar(petId, path),
  removeAvatar: (petId) => browserApi().removeAvatar(petId),
}

/**
 * The pet profile as a page (design `pet-form`): «О питомце» with the
 * optional photo, «Даты», and every other field of the profile in the
 * sections below — folded for a new pet, open for an edit, none of them
 * required. Beside it, the path chosen at the first entry, or the usual
 * notes. Leaving with unsaved changes — any link on the page, a reload or
 * closing the tab — asks first. Delete is set apart and confirmed.
 *
 * A save goes once: a second press while it runs sends nothing, and an
 * error keeps everything typed. The photo goes after the pet is saved; if
 * only the photo fails, the pet is not saved again — the photo can be sent
 * once more for the same pet, or left out.
 */
export default function PetForm({ pet, hints = {}, photoUrl = null, today: pageToday, onboarding }: Props) {
  const dict = useTranslations()
  const t = dict.pets
  const isEdit = !!pet
  const today = useToday(pageToday)
  const formId = useId()
  const notesTitleId = `${formId}-notes-title`
  const notesCountId = `${formId}-notes-count`
  const nameErrorId = `${formId}-name-error`
  const fieldId = (name: string) => `${formId}-${name}`

  const [species, setSpecies] = useState<PetSpecies>(pet?.species ?? 'cat')
  const [name, setName] = useState(pet?.name ?? '')
  const [breed, setBreed] = useState(pet?.breed ?? '')
  const [openedDates] = useState<DatesFields>(() => datesFromPet(pet, pageToday ?? today))
  const [dates, setDates] = useState<DatesFields>(openedDates)
  const [datesError, setDatesError] = useState<PetDatesError | null>(null)
  const [photo, setPhoto] = useState<PhotoChange>({ kind: 'keep' })
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
  /** The pet is saved and only its photo failed: where to go next, and the pet to send it for. */
  const [photoFailed, setPhotoFailed] = useState<{ petId: string; doneHref: string } | null>(null)
  const [photoRetrying, setPhotoRetrying] = useState(false)
  const [moreOpen, setMoreOpen] = useState({ health: isEdit, life: isEdit })

  const nameRef = useRef<HTMLInputElement>(null)
  const photoFailedRef = useRef<HTMLDivElement>(null)
  /** One save at a time: a second press while the first runs sends nothing. */
  const inFlight = useRef(false)

  // A path named in the address is this account's path from now on: it goes
  // on after the owner leaves the form and comes back by another way.
  const goal = onboarding?.goal ?? null
  const userId = onboarding?.userId
  useEffect(() => {
    if (userId && goal) updateOnboarding(userId, (state) => chooseGoal(state, goal))
  }, [userId, goal])
  const deleteButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (photoFailed) photoFailedRef.current?.focus()
  }, [photoFailed])

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
    JSON.stringify(dates) !== JSON.stringify(openedDates) ||
    photo.kind !== 'keep' ||
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
  // anywhere on the page opens our own dialog first.
  const { leaveHref, leaveLinkRef, stay, leave } = useLeaveGuard(dirty && !photoFailed, petFormCancelHref(pet?.id))

  /** Opens a folded section and takes the owner to it. */
  function openMore(section: 'health' | 'life') {
    setMoreOpen((current) => ({ ...current, [section]: true }))
    requestAnimationFrame(() => {
      const target = document.getElementById(fieldId(`more-${section}`))
      target?.scrollIntoView({ block: 'start' })
      target?.querySelector<HTMLElement>('summary')?.focus()
    })
  }

  async function sendPhoto(petId: string, doneHref: string) {
    try {
      await applyPhoto(photoDeps, petId, photo)
      leave(doneHref)
      return true
    } catch (error) {
      console.warn('[pets] photo not saved', error)
      setPhotoFailed({ petId, doneHref })
      return false
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (inFlight.current) return
    if (!name.trim()) {
      setNameError(t.errorName)
      nameRef.current?.focus()
      return
    }
    const read = readPetDates(dates, today)
    if (!read.ok) {
      setDatesError(read)
      const field = { birthDate: 'birth-date', approxYears: 'approx-years', approxMonths: 'approx-months', adoptedOn: 'adopted-on' }[read.field]
      document.getElementById(fieldId(field))?.focus()
      return
    }
    inFlight.current = true
    setSaving(true)
    setFormError('')
    setNameError('')
    setDatesError(null)

    const request = petFormRequest(
      pet,
      {
        species, name, breed, dates: read.value, weightKg, sex, neutered, indoorOutdoor, diet,
        sizeClass, walkActivity, allergies, vaccinated, chronicConditions, medications, notes,
      },
      today,
    )
    let saved: { id?: unknown } | null = null
    try {
      const res = await fetch(request.url, {
        method: request.method,
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(request.body),
      })
      if (res.ok) saved = await res.json().catch(() => ({}))
    } catch {
      saved = null
    }
    if (!saved) {
      // What was typed stays; the owner can try again.
      inFlight.current = false
      setFormError(t.saveError)
      setSaving(false)
      return
    }

    // From here on the pet exists: whatever happens to the photo, it is never sent again.
    const petId = pet?.id ?? (typeof saved.id === 'string' ? saved.id : null)
    if (!pet && userId) updateOnboarding(userId, finishOnboarding)
    const doneHref = pet
      ? petFormDoneHref({ kind: 'updated', petId: pet.id })
      : petId
        ? petFormDoneHref({ kind: 'created', petId, goal })
        : '/pets?petSaved=created'
    if (!petId || photo.kind === 'keep') {
      leave(doneHref)
      return
    }
    if (!(await sendPhoto(petId, doneHref))) setSaving(false)
  }

  async function retryPhoto() {
    if (!photoFailed || photoRetrying) return
    setPhotoRetrying(true)
    const ok = await sendPhoto(photoFailed.petId, photoFailed.doneHref)
    if (!ok) setPhotoRetrying(false)
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
    leave(petFormDoneHref({ kind: 'deleted', petId: pet.id }))
  }

  const goalCard = goal && !isEdit
    ? goal === 'check'
      ? { title: dict.onboarding.goalCheckTitle, body: dict.onboarding.goalCheckBody }
      : { title: dict.onboarding.goalHealthTitle, body: dict.onboarding.goalHealthBody }
    : null

  return (
    <form className="care-columns pet-form-page" onSubmit={handleSubmit} noValidate aria-busy={saving || undefined}>
      <div>
        <section className="card pet-form" aria-labelledby={fieldId('about')}>
          <h2 id={fieldId('about')}>{t.sectionAbout}</h2>
          <PetPhotoField species={species} photoUrl={photoUrl} change={photo} onChange={setPhoto} />
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

            <Field id={fieldId('name')} label={t.name} required error={nameError} errorId={nameErrorId}>
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
          </div>
        </section>

        <section className="card pet-form" aria-labelledby={fieldId('dates')}>
          <h2 id={fieldId('dates')}>{t.sectionDates}</h2>
          <PetDatesFields
            idBase={formId}
            fields={dates}
            onChange={(next) => { setDates(next); setDatesError(null) }}
            error={datesError}
            today={today}
          />
        </section>

        <details
          id={fieldId('more-health')}
          className="card pet-form pet-form-more"
          open={moreOpen.health}
          onToggle={e => {
            const open = e.currentTarget.open
            setMoreOpen(current => (current.health === open ? current : { ...current, health: open }))
          }}
        >
          <summary>
            <span>
              <strong>{t.moreHealth}</strong>
              <small>{t.moreHealthNote}</small>
            </span>
            <Icon name="arrow" />
          </summary>
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

            <Field id={fieldId('vaccinated')} label={t.vaccination} hint={hints.vaccinated}>
              <select
                id={fieldId('vaccinated')}
                aria-describedby={hints.vaccinated ? `${fieldId('vaccinated')}-hint` : undefined}
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

            <Field id={fieldId('medications')} label={t.medications} hint={hints.medications}>
              <input
                id={fieldId('medications')}
                aria-describedby={hints.medications ? `${fieldId('medications')}-hint` : undefined}
                value={medications}
                onChange={e => setMedications(e.target.value)}
                placeholder={medicationsPlaceholder}
                className="input"
                autoComplete="off"
              />
            </Field>
          </div>

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
        </details>

        <details
          id={fieldId('more-life')}
          className="card pet-form pet-form-more"
          open={moreOpen.life}
          onToggle={e => {
            const open = e.currentTarget.open
            setMoreOpen(current => (current.life === open ? current : { ...current, life: open }))
          }}
        >
          <summary>
            <span>
              <strong>{t.moreLife}</strong>
              <small>{t.moreLifeNote}</small>
            </span>
            <Icon name="arrow" />
          </summary>
          <div className="form-grid">
            <Field id={fieldId('weight')} label={t.weightKg} hint={hints.weight}>
              <input
                id={fieldId('weight')}
                aria-describedby={hints.weight ? `${fieldId('weight')}-hint` : undefined}
                type="text"
                inputMode="decimal"
                value={weightKg}
                onChange={e => setWeightKg(sanitizeDecimalInput(e.target.value))}
                placeholder="4.5"
                className="input"
                autoComplete="off"
              />
            </Field>

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
        </details>

        {formError && <p role="alert" className="banner error form-error">{formError}</p>}

        {photoFailed ? (
          <div ref={photoFailedRef} tabIndex={-1} className="card soft pet-photo-failed" role="alert">
            <h2>{t.photo.failedTitle}</h2>
            <p>{t.photo.failedBody}</p>
            <div className="care-actions">
              <button type="button" className="btn primary" onClick={() => void retryPhoto()} aria-disabled={photoRetrying || undefined}>
                {photoRetrying ? t.photo.retrying : t.photo.retry}
              </button>
              <button type="button" className="link" onClick={() => leave(photoFailed.doneHref)}>
                {t.photo.continueWithout}
              </button>
            </div>
          </div>
        ) : (
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
              <Link href={petFormCancelHref(pet?.id)} className="link">{t.cancelBtn}</Link>
              <button type="submit" className="btn primary" aria-disabled={saving || undefined}>
                {saving ? t.savingBtn : isEdit ? t.saveBtn : goal ? t.saveContinue : t.addBtn}
              </button>
            </div>
          </div>
        )}
      </div>

      <aside>
        {goalCard ? (
          <section className="card soft" aria-labelledby={fieldId('goal')}>
            <h2 id={fieldId('goal')}>{goalCard.title}</h2>
            <p>{goalCard.body}</p>
            <div className="divider" />
            <p className="small">{dict.onboarding.goalNote}</p>
          </section>
        ) : (
          <section className="card soft pet-form-aside" aria-labelledby={fieldId('aside')}>
            <h2 id={fieldId('aside')}>{t.asideTitle}</h2>
            <p>{t.asideBody}</p>
            <div className="divider" />
            <p className="small">{t.asideNote}</p>
            {isEdit && (
              <Link href="/checks" className="link">
                {t.asideHistory}
                <Icon name="arrow" />
              </Link>
            )}
          </section>
        )}

        <section className="card" aria-labelledby={fieldId('more')}>
          <h2 id={fieldId('more')}>{t.sectionMore}</h2>
          <ul className="pet-form-more-links">
            <li>
              <button type="button" onClick={() => openMore('health')}>
                <span>
                  {t.moreHealth}
                  <small>{t.moreHealthNote}</small>
                </span>
                <Icon name="arrow" />
              </button>
            </li>
            <li>
              <button type="button" onClick={() => openMore('life')}>
                <span>
                  {t.moreLife}
                  <small>{t.moreLifeNote}</small>
                </span>
                <Icon name="arrow" />
              </button>
            </li>
          </ul>
        </section>
      </aside>

      {confirmDelete && pet && (
        <ConfirmDialog
          title={t.confirmDeleteTitle.replace('{name}', () => pet.name)}
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
          onCancel={stay}
          onConfirm={() => leave(leaveHref)}
          returnFocusRef={leaveLinkRef}
        />
      )}
    </form>
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
  hint,
  required = false,
}: {
  id: string
  label: string
  /** A standing note under the control, read with it (`${id}-hint`). */
  hint?: string
  /** Marks the label with an asterisk for sight; the input says it with `aria-required`. */
  required?: boolean
  children: React.ReactNode
  error?: string
  errorId?: string
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
        {required && <span aria-hidden> *</span>}
      </label>
      {children}
      {hint && <span id={`${id}-hint`} className="field-hint">{hint}</span>}
      {error && <span id={errorId} className="field-error" role="alert">{error}</span>}
    </div>
  )
}
