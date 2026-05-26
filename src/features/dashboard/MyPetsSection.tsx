'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Cat } from '@/shared/types'
import { useTranslations } from '@/components/LocaleProvider'
import CatAvatar from '@/components/CatAvatar'
import CatForm from '@/features/cats/CatForm'

type ModalState = null | 'new' | Cat
type SavedKind = 'created' | 'updated' | 'deleted'

interface Props {
  cats: Cat[]
}

/**
 * Interactive "Мои питомцы" section. Wraps the existing list and pops the cat
 * profile form as an in-place modal so the user never leaves the dashboard.
 */
export default function MyPetsSection({ cats }: Props) {
  const dict = useTranslations()
  const t = dict.dashboard
  const router = useRouter()

  const [modal, setModal] = useState<ModalState>(null)
  const [banner, setBanner] = useState<SavedKind | null>(null)

  function handleSaved(kind: SavedKind) {
    setModal(null)
    setBanner(kind)
    router.refresh()
  }

  // Auto-dismiss the banner after a few seconds.
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
          className="mb-4 rounded-2xl border border-status-good-fg/10 bg-status-good-bg px-4 py-3 text-sm font-semibold text-status-good-fg"
        >
          {banner === 'created' ? t.catAdded : banner === 'deleted' ? t.catDeleted : t.catSaved}
        </div>
      )}

      <section className="app-card mb-6 p-6 sm:p-7">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold text-text sm:text-2xl">{t.myCats}</h2>
          <button
            type="button"
            onClick={() => setModal('new')}
            className="app-link shrink-0"
          >
            {t.addCat}
          </button>
        </div>
        {!cats.length ? (
          <div className="app-empty-state">
            <h3 className="text-base font-bold text-text">{t.catsEmptyTitle}</h3>
            <p className="mt-1 text-sm leading-relaxed">{t.noCats}</p>
            <button
              type="button"
              onClick={() => setModal('new')}
              className="app-button-secondary app-button-sm mt-4"
            >
              {t.addFirstCat}
            </button>
          </div>
        ) : (
          <ul className="grid gap-1">
            {cats.map(cat => (
              <li key={cat.id}>
                <button
                  type="button"
                  onClick={() => setModal(cat)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-canvas-soft/60"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <CatAvatar size={48} />
                    <div className="min-w-0">
                      <div className="text-base font-bold text-text truncate">{cat.name}</div>
                      {(cat.breed || cat.age_years) && (
                        <div className="text-sm text-text-faint truncate">
                          {[cat.breed, cat.age_years ? `${cat.age_years} ${t.yearsOld}` : null].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {modal && (
        <CatLocalModal
          cat={modal === 'new' ? undefined : modal}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  )
}

function CatLocalModal({
  cat,
  onClose,
  onSaved,
}: {
  cat?: Cat
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
        <CatForm cat={cat} modal onSaved={onSaved} />
      </div>
    </div>
  )
}
