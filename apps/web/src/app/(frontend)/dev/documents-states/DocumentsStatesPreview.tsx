'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { savedSummary } from '@lapka/shared'
import { useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import ConfirmedSummary from '@/features/documents/recognition/ConfirmedSummary'
import ReviewScreen from '@/features/documents/recognition/ReviewScreen'
import {
  FailedState,
  NoCreditsState,
  NothingFoundState,
  RecognitionOffer,
  RecognitionProgress,
} from '@/features/documents/recognition/RecognitionStates'
import { SourceLine } from '@/features/documents/recognition/SourceLine'
import { useToday } from '@/features/forms/use-today'
import {
  FIXTURE_MISMATCH_DRAFT,
  FIXTURE_PASSPORT,
  FIXTURE_PASSPORT_DRAFT,
  FIXTURE_PET,
  FIXTURE_PRESCRIPTION,
  FIXTURE_PRICES,
  FIXTURE_RECIPE_DRAFT,
  FIXTURE_RECORD,
  FIXTURE_SAVED_PASSPORT,
  FIXTURE_SAVED_RECIPE,
  PREVIEW_STATES,
  STATE_TITLES,
  type PreviewState,
} from './fixtures'

const BASE = '/dev/documents-states'

/** A state of this preview; `page` and `from` for the original stand-in. */
function stateHref(state: PreviewState, extra: { page?: number; from?: string } = {}): string {
  const query = new URLSearchParams({ state })
  if (extra.page && extra.page > 1) query.set('page', String(extra.page))
  if (extra.from) query.set('from', extra.from)
  return `${BASE}?${query.toString()}`
}

/** A short wait, so the busy states show; nothing is sent anywhere. */
const pause = () => new Promise<void>((resolve) => window.setTimeout(resolve, 500))

/**
 * The recognition screens on TEST DATA (`fixtures.ts`), one state at a
 * time, with the list of states above. The real components; only their
 * data and their callbacks are the preview's: a callback moves to the next
 * state, it never calls the API.
 */
export default function DocumentsStatesPreview({ state, page, from }: { state: PreviewState; page: number; from: string | null }) {
  return (
    <div className="health-page">
      <div className="banner error document-alert fixtures-mark" role="note">
        <strong>Тестовые данные</strong>
        <p>Предпросмотр состояний распознавания документов. Сервер распознавания (DOC-2) ещё не подключён: всё на этой странице — фикстуры, ничего не сохраняется.</p>
      </div>
      <nav aria-label="Состояния">
        <ul className="fixtures-states">
          {PREVIEW_STATES.map((key) => (
            <li key={key}>
              <Link href={stateHref(key)} className="chip" aria-current={key === state ? 'page' : undefined}>
                {STATE_TITLES[key]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <PreviewBody key={`${state}-${page}-${from}`} state={state} page={page} from={from} />
    </div>
  )
}

function PreviewBody({ state, page, from }: { state: PreviewState; page: number; from: string | null }) {
  const router = useRouter()
  const today = useToday()
  const dict = useTranslations()
  const words = dict.documents

  switch (state) {
    case 'stored':
    case 'paid':
    case 'credits': {
      const price = FIXTURE_PRICES[state]
      return (
        <FixtureDocument title={FIXTURE_PASSPORT.title} meta={`${words.kinds.vet_passport} · 4 страницы`} originalHref={stateHref('original', { from: 'stored' })}>
          {state === 'credits' ? (
            <NoCreditsState price={price.price} credits={price.credits} topUpHref="/credits" />
          ) : (
            <RecognitionOffer
              kind="vet_passport"
              left={price.left}
              price={price.price}
              credits={price.credits}
              onRecognize={() => router.push(stateHref('recognizing'))}
              topUpHref="/credits"
            />
          )}
        </FixtureDocument>
      )
    }
    case 'recognizing':
      return (
        <FixtureDocument title={words.recognition.progress.title} meta={FIXTURE_PASSPORT.title} originalHref={null}>
          <RecognitionProgress title={FIXTURE_PASSPORT.title} listHref={stateHref('stored')} />
        </FixtureDocument>
      )
    case 'failed':
      return (
        <FixtureDocument title={FIXTURE_PASSPORT.title} meta={words.saved.added} originalHref={null}>
          <FailedState onRetry={() => router.push(stateHref('recognizing'))} originalHref={stateHref('original', { from: 'failed' })} />
        </FixtureDocument>
      )
    case 'nothing':
      return (
        <FixtureDocument title={FIXTURE_PASSPORT.title} meta={words.saved.added} originalHref={null}>
          {/* The real «Добавить другие страницы» opens the add screen; here the fixture document. */}
          <NothingFoundState addPagesHref={stateHref('stored')} originalHref={stateHref('original', { from: 'nothing' })} />
        </FixtureDocument>
      )
    case 'review':
    case 'edit':
    case 'mismatch':
    case 'discard':
    case 'recipe': {
      const recipe = state === 'recipe'
      const doc = recipe ? FIXTURE_PRESCRIPTION : FIXTURE_PASSPORT
      const own: PreviewState = state === 'edit' || state === 'discard' ? 'review' : state
      return (
        <ReviewScreen
          petName={FIXTURE_PET.name}
          species={FIXTURE_PET.species}
          today={today}
          document={{ id: doc.id, title: doc.title }}
          draft={recipe ? FIXTURE_RECIPE_DRAFT : state === 'mismatch' ? FIXTURE_MISMATCH_DRAFT : FIXTURE_PASSPORT_DRAFT}
          backHref={stateHref('stored')}
          originalHref={(n, opener) => stateHref('original', { page: n, from: opener === 'edit' ? `${own}-edit` : own })}
          recordHref={() => stateHref('vaccination')}
          onConfirm={async () => {
            await pause()
            router.push(stateHref(recipe ? 'confirmed-recipe' : 'confirmed'))
          }}
          onDiscard={async () => {
            await pause()
            router.push(stateHref('stored'))
          }}
          initial={{ edit: state === 'edit' ? 'v3' : undefined, discard: state === 'discard' }}
        />
      )
    }
    case 'confirmed':
    case 'confirmed-recipe': {
      const recipe = state === 'confirmed-recipe'
      const doc = recipe ? FIXTURE_PRESCRIPTION : FIXTURE_PASSPORT
      return (
        <div>
          <div className="pagehead">
            <div>
              <h1>{words.recognition.confirmed.title}</h1>
              <p>{FIXTURE_PET.name}</p>
            </div>
          </div>
          <div className="section-layout document-layout">
            <div className="section-main document-main">
              <ConfirmedSummary
                groups={savedSummary(recipe ? FIXTURE_SAVED_RECIPE : FIXTURE_SAVED_PASSPORT)}
                source={{ title: doc.title, href: stateHref('original', { from: state }) }}
                doneHref={stateHref('vaccination')}
              />
            </div>
            <aside className="section-aside document-aside">
              <h2>{words.recognition.confirmed.asideTitle}</h2>
              <p>{words.recognition.confirmed.asideBody}</p>
            </aside>
          </div>
        </div>
      )
    }
    case 'vaccination':
      return (
        <div>
          <Link href={stateHref('confirmed')} className="link health-back">
            <Icon name="back" />
            {dict.medicalRecord.eventRecord.back}
          </Link>
          <div className="pagehead">
            <div>
              <h1>{FIXTURE_RECORD.title}</h1>
              <p>{FIXTURE_PET.name}</p>
            </div>
          </div>
          <div className="section-layout">
            <div className="section-main">
              <section className="card event-record-head">
                <h2>{FIXTURE_RECORD.day}</h2>
                <p>{`${dict.medicalRecord.eventRecord.clinic}: ${FIXTURE_RECORD.clinic}`}</p>
              </section>
              <section className="card event-record-items">
                <ul>
                  {FIXTURE_RECORD.items.map((item) => (
                    <li key={item.name}>
                      <strong>{item.name}</strong>
                      <span>{item.targets}</span>
                      <span>{item.next}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <SourceLine
                title={FIXTURE_PASSPORT.title}
                page={FIXTURE_RECORD.sourcePage}
                href={stateHref('original', { page: FIXTURE_RECORD.sourcePage, from: 'vaccination' })}
              />
            </div>
          </div>
        </div>
      )
    case 'original':
      return <FixtureOriginal page={page} from={from} />
  }
}

/** A stored document's head and «Открыть оригинал», as the real viewer draws them, on fixtures. */
function FixtureDocument({
  title,
  meta,
  originalHref,
  children,
}: {
  title: string
  meta: string
  originalHref: string | null
  children: React.ReactNode
}) {
  const words = useTranslations().documents
  return (
    <div>
      <Link href={stateHref('stored')} className="link health-back">
        <Icon name="back" />
        {words.view.backToList}
      </Link>
      <div className="pagehead">
        <div>
          <h1 className="document-heading">{title}</h1>
          <p>{meta}</p>
        </div>
      </div>
      <div className="section-layout document-layout">
        <div className="section-main document-main">
          {originalHref && (
            <Link href={originalHref} className="document-row document-original">
              <span className="document-format" aria-hidden>{words.format.photo}</span>
              <span className="document-row-text">
                <strong>{words.view.openOriginal}</strong>
                <small>{`4 страницы · ${words.view.photos}`}</small>
              </span>
              <Icon name="chevron" />
            </Link>
          )}
          {children}
        </div>
        <aside className="section-aside document-aside">
          <h2>{words.view.asideTitle}</h2>
          <p>{words.view.asideBody}</p>
        </aside>
      </div>
    </div>
  )
}

/**
 * Stands in for the original viewer, which needs a stored file: the page
 * number and the way back to the state it was opened from — the review
 * restores its selection, edits, scroll and focus from there.
 */
function FixtureOriginal({ page, from }: { page: number; from: string | null }) {
  const words = useTranslations().documents.original
  const total = FIXTURE_PASSPORT.pages
  const current = Math.min(Math.max(page, 1), total)
  const opener = from?.endsWith('-edit') ? from.slice(0, -'-edit'.length) : from
  const back = (PREVIEW_STATES as readonly string[]).includes(opener ?? '') ? (opener as PreviewState) : 'stored'
  const label = from?.endsWith('-edit') ? words.toEdit : back === 'review' || back === 'mismatch' || back === 'recipe' ? words.toReview : back === 'vaccination' ? words.back : words.toDocument
  return (
    <div className="document-original-page">
      <Link href={stateHref(back)} className="link health-back">
        <Icon name="back" />
        {label}
      </Link>
      <div className="pagehead">
        <div>
          <h1 className="document-heading">{FIXTURE_PASSPORT.title}</h1>
          <p>{words.pageOf.replace('{n}', String(current)).replace('{total}', String(total))}</p>
        </div>
      </div>
      <div className="fixtures-sheet">
        <p>{`Тестовые данные: здесь будет страница ${current} настоящего документа.`}</p>
      </div>
      <div className="document-original-actions">
        <div className="document-turn">
          <Link href={stateHref('original', { page: current - 1, from: from ?? undefined })} className="btn secondary" aria-disabled={current <= 1 || undefined}>
            {words.previous}
          </Link>
          <Link href={stateHref('original', { page: Math.min(current + 1, total), from: from ?? undefined })} className="btn secondary" aria-disabled={current >= total || undefined}>
            {words.next}
          </Link>
        </div>
      </div>
      <div className="document-original-back">
        <Link href={stateHref(back)} className="btn secondary">
          {label}
        </Link>
      </div>
    </div>
  )
}
