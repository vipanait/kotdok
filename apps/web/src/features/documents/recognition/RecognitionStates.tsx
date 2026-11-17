'use client'

import Link from 'next/link'
import { checksCount, recognizeLabel } from '@lapka/shared'
import { useLocale, useTranslations } from '@/components/LocaleProvider'

/**
 * The small states of recognition (DOC-2): the offer on a stored passport or
 * prescription, the wait, a failure, nothing found, and a balance too short.
 * Every number — free uses left, the price, the balance — is passed in from
 * the API; none is written here. Each block sits on the page, not in a card.
 */

/**
 * «Добавим записи в медкарту?» with «Распознать — бесплатно, осталось N» or
 * «Распознать — 1 проверка». With neither a free use nor the credits, the
 * top-up state instead. Shown only once the API says recognition is
 * available for the document (ruling R2): nothing renders it on the real
 * stored-document screen yet.
 */
export function RecognitionOffer({
  kind,
  left,
  price,
  credits,
  busy = false,
  onRecognize,
  topUpHref,
}: {
  kind: 'vet_passport' | 'prescription'
  /** `free_recognitions_left` of `GET /documents`. */
  left: number
  /** `recognition_price` of `GET /documents`. */
  price: number
  /** The cabinet's balance. */
  credits: number
  busy?: boolean
  onRecognize: () => void
  topUpHref: string
}) {
  const locale = useLocale()
  const words = useTranslations().documents.recognition.offer
  const label = recognizeLabel(left, price, credits, locale)
  if (label.offer.kind === 'short') return <NoCreditsState price={label.offer.price} credits={credits} topUpHref={topUpHref} />
  return (
    <section className="document-quiet recognition-offer" aria-labelledby="recognition-offer-title">
      <h2 id="recognition-offer-title">{words.title}</h2>
      <p>{words.body[kind]}</p>
      <button type="button" className="btn primary recognition-main" aria-disabled={busy || undefined} onClick={() => !busy && onRecognize()}>
        {busy ? words.starting : label.text}
      </button>
      <p className="field-hint">
        {label.offer.kind === 'paid' ? words.paidNote.replace('{balance}', checksCount(credits, locale)) : words.freeNote}
      </p>
    </section>
  )
}

/** «Нужна 1 проверка»: no free recognitions left and the balance is short. The file is there anyway. */
export function NoCreditsState({ price, credits, topUpHref }: { price: number; credits: number; topUpHref: string }) {
  const locale = useLocale()
  const words = useTranslations().documents.recognition.credits
  return (
    <section className="document-quiet recognition-offer" aria-labelledby="recognition-credits-title">
      <h2 id="recognition-credits-title">{words.title.replace('{price}', checksCount(price, locale))}</h2>
      <p>{words.body.replace('{balance}', checksCount(credits, locale))}</p>
      <Link href={topUpHref} className="btn primary recognition-main">
        {words.topUp}
      </Link>
    </section>
  )
}

/**
 * The wait: no percentage — the time is not known — and where the result
 * will wait if the owner leaves.
 */
export function RecognitionProgress({ title, listHref }: { title: string; listHref: string }) {
  const words = useTranslations().documents.recognition.progress
  return (
    <section className="document-quiet recognition-progress-block" aria-labelledby="recognition-progress-title">
      <h2 id="recognition-progress-title">{words.heading}</h2>
      <p>{words.body}</p>
      <div className="recognition-progress" role="progressbar" aria-label={words.label} aria-busy="true">
        <span />
      </div>
      <p role="status">{words.where.replace('{title}', title)}</p>
      <Link href={listHref} className="link">
        {words.toList}
      </Link>
    </section>
  )
}

/** Two actions in one block: the main one first; one under the other on a phone. */
function StateActions({ children }: { children: React.ReactNode }) {
  return <div className="recognition-actions">{children}</div>
}

/** Recognition failed: «Попробовать снова» and «Открыть оригинал». Nothing was spent. */
export function FailedState({ onRetry, originalHref, busy = false }: { onRetry: () => void; originalHref: string; busy?: boolean }) {
  const words = useTranslations().documents.recognition.failed
  return (
    <section className="document-quiet" aria-labelledby="recognition-failed-title">
      <h2 id="recognition-failed-title">{words.title}</h2>
      <p>{words.body}</p>
      <StateActions>
        <button type="button" className="btn primary" aria-disabled={busy || undefined} onClick={() => !busy && onRetry()}>
          {words.retry}
        </button>
        <Link href={originalHref} className="btn secondary">
          {words.original}
        </Link>
      </StateActions>
    </section>
  )
}

/**
 * Nothing found: «Добавить другие страницы» and «Открыть оригинал». Nothing
 * was spent. `addPagesHref` null: adding pages is not possible yet (the
 * DOC-1 API cannot add pages to a stored document) — the button is shown
 * inert, with `note` saying why.
 */
export function NothingFoundState({ addPagesHref, originalHref, note }: { addPagesHref: string | null; originalHref: string; note?: string }) {
  const words = useTranslations().documents.recognition.nothing
  return (
    <section className="document-quiet" aria-labelledby="recognition-nothing-title">
      <h2 id="recognition-nothing-title">{words.title}</h2>
      <p>{words.body}</p>
      <StateActions>
        {addPagesHref ? (
          <Link href={addPagesHref} className="btn primary">
            {words.addPages}
          </Link>
        ) : (
          <button type="button" className="btn primary" aria-disabled="true" aria-describedby={note ? 'recognition-nothing-note' : undefined}>
            {words.addPages}
          </button>
        )}
        <Link href={originalHref} className="btn secondary">
          {words.original}
        </Link>
      </StateActions>
      {note && <p id="recognition-nothing-note" className="field-hint">{note}</p>}
    </section>
  )
}
