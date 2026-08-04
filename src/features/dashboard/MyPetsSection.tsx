'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Pet, PetLatestCheck } from '@/shared/types'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import PetAvatar from '@/components/PetAvatar'
import PetForm from '@/features/pets/PetForm'
import { URGENCY_TEXT_CLASS, type UrgencyKey } from '@/shared/utils/urgency'

type ModalState = null | 'new' | Pet
type SavedKind = 'created' | 'updated' | 'deleted'

interface Props {
  pets?: Pet[]
  /** @deprecated Use pets */
  cats?: Pet[]
  latestChecksByPet?: Record<string, PetLatestCheck>
  /** @deprecated Use latestChecksByPet */
  latestChecksByCat?: Record<string, PetLatestCheck>
}

function AccentedCopy({ template, accent }: { template: string; accent: string }) {
  const parts = template.split('{accent}')
  if (parts.length < 2) return <>{template}</>
  return (
    <>
      {parts[0]}
      <span className="app-accent-serif">{accent}</span>
      {parts.slice(1).join('{accent}')}
    </>
  )
}

export default function MyPetsSection({
  pets: petsProp,
  cats,
  latestChecksByPet: latestProp,
  latestChecksByCat,
}: Props) {
  const pets = petsProp ?? cats ?? []
  const latestChecksByPet = latestProp ?? latestChecksByCat ?? {}
  const dict = useTranslations()
  const t = dict.dashboard
  const locale = useLocale()
  const router = useRouter()

  const [modal, setModal] = useState<ModalState>(null)
  const [banner, setBanner] = useState<SavedKind | null>(null)

  function handleSaved(kind: SavedKind) {
    setModal(null)
    setBanner(kind)
    router.refresh()
  }

  useEffect(() => {
    if (!banner) return
    const id = window.setTimeout(() => setBanner(null), 4000)
    return () => window.clearTimeout(id)
  }, [banner])

  return (
    <>
      {banner && (
        <div
          role="status"
          className="mb-6 rounded-2xl border border-status-good-fg/10 bg-status-good-bg px-4 py-3 text-sm font-semibold text-status-good-fg"
        >
          {banner === 'created' ? t.catAdded : banner === 'deleted' ? t.catDeleted : t.catSaved}
        </div>
      )}

      <section className="app-card mb-6 p-6 sm:p-7">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold text-text sm:text-2xl">{t.myCats}</h2>
          <button type="button" onClick={() => setModal('new')} className="app-link shrink-0">
            {t.addCat}
          </button>
        </div>
        {!pets.length ? (
          <div className="app-empty-state">
            <h3 className="text-base font-bold text-text">{t.catsEmptyTitle}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
              <AccentedCopy template={t.noCats} accent={t.noCatsAccent} />
            </p>
          </div>
        ) : (
          <ul className="grid gap-2">
            {pets.map(pet => {
              const latest = latestChecksByPet[pet.id]
              const urgencyKey = latest?.urgency as UrgencyKey | undefined
              const statusLabel = urgencyKey && dict.urgency[urgencyKey]?.label
                ? dict.urgency[urgencyKey].label.charAt(0) + dict.urgency[urgencyKey].label.slice(1).toLowerCase()
                : null
              const dateLabel = latest
                ? new Date(latest.created_at).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', {
                    day: 'numeric',
                    month: 'short',
                  })
                : null
              const speciesLabel = pet.species === 'dog' ? dict.pets.speciesDog : dict.pets.speciesCat

              return (
                <li key={pet.id}>
                  <button
                    type="button"
                    onClick={() => setModal(pet)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl bg-canvas-soft/70 px-3.5 py-3.5 text-left transition-colors hover:bg-canvas-soft"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <PetAvatar size={48} species={pet.species ?? 'cat'} />
                      <div className="min-w-0">
                        <div className="text-base font-bold text-text truncate">
                          {pet.name}
                          <span className="ml-2 text-xs font-semibold text-text-faint">{speciesLabel}</span>
                        </div>
                        {(pet.breed || pet.age_years) && (
                          <div className="text-sm text-text-faint truncate">
                            {[pet.breed, pet.age_years ? `${pet.age_years} ${t.yearsOld}` : null].filter(Boolean).join(', ')}
                          </div>
                        )}
                        <div className="mt-0.5 text-xs text-text-muted truncate">
                          {latest && statusLabel && dateLabel ? (
                            <>
                              {t.lastCheckPrefix}{' '}
                              <span className={URGENCY_TEXT_CLASS[urgencyKey!] ?? undefined}>{statusLabel}</span>
                              {' · '}
                              {dateLabel}
                            </>
                          ) : (
                            t.lastCheckNever
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="shrink-0 text-text-faint text-lg leading-none" aria-hidden>›</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {modal && (
        <PetLocalModal
          pet={modal === 'new' ? undefined : modal}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  )
}

function PetLocalModal({
  pet,
  onClose,
  onSaved,
}: {
  pet?: Pet
  onClose: () => void
  onSaved: (kind: SavedKind) => void
}) {
  const dict = useTranslations()

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="app-overlay fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="app-card relative max-h-[95dvh] w-full overflow-y-auto rounded-b-none sm:max-w-2xl sm:rounded-b-3xl">
        <button
          type="button"
          onClick={onClose}
          className="app-icon-button absolute top-4 right-4 z-10 text-xl leading-none"
          aria-label={dict.common.close}
        >
          ×
        </button>
        <PetForm pet={pet} modal onSaved={onSaved} onCancel={onClose} />
      </div>
    </div>
  )
}
