'use client'

import Link from 'next/link'
import type { HealthEvent, HealthOverview, SymptomCheckRecord } from '@lapka/contracts'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import PetAvatar from '@/components/PetAvatar'
import Icon, { type IconName } from '@/components/ui/Icon'
import UrgencyBadge from '@/components/ui/UrgencyBadge'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { formatCount } from '@/shared/i18n/plural'
import type { ChecksPart } from './record-load'
import { addableRecordTypes, medicalRecordHref, sectionOpen, MEDICAL_RECORD_STAGE } from './stage'
import WeightChart from './WeightChart'
import {
  dueBlock,
  formatDay,
  headFacts,
  importantFacts,
  sectionCards,
  weightCard,
  type DueBlock,
  type DueRow,
  type SectionCard,
  type WeightCard,
} from './view-model'

const KIND_ICON: Record<HealthEvent['kind'], IconName> = {
  vaccination: 'vaccine',
  parasite: 'parasite',
  visit: 'visit',
}

/** The record of one pet, drawn from data the API returned. */
export default function MedicalRecordView({
  petId,
  overview,
  checks,
  today,
  onRetry,
  retrying,
  notice,
}: {
  petId: string
  overview: HealthOverview
  checks: ChecksPart
  /** The owner's calendar day, which "overdue" and "in 5 days" count from. */
  today: string
  /** Loads the record again: offered where a part of it failed. */
  onRetry: () => void
  retrying: boolean
  /** A message about the data itself (it could not be refreshed), under the head as in the design. */
  notice?: React.ReactNode
}) {
  const dict = useTranslations()
  const locale = useLocale()
  const words = dict.medicalRecord
  const head = headFacts(dict, locale, overview, today)
  const due = dueBlock(dict, locale, overview, today)
  const facts = importantFacts(dict, overview, today)
  const addable = addableRecordTypes(overview.writable)
  const vetSummary = MEDICAL_RECORD_STAGE.vetSummary
  const hasActions = addable.length > 0 || vetSummary

  return (
    <div className="health-page">
      <Link href="/pets" className="link health-back">
        <Icon name="back" />
        {words.allPets}
      </Link>

      <header className="health-head">
        <PetAvatar size={84} species={overview.pet.species} />
        <div className="health-head-copy">
          <h1 className="pet-page-title">{head.name}</h1>
          <p>{head.meta}</p>
        </div>
        <div className="health-head-side">
          {head.weight && (
            <div className="health-weight">
              <strong>{head.weight}</strong>
              {head.weightNote && <p>{head.weightNote}</p>}
            </div>
          )}
          <Link href={medicalRecordHref.form(petId)} className="link health-form-link">
            {words.form}
            <Icon name="arrow" />
          </Link>
        </div>
      </header>

      {notice}

      <div className={`health-grid${hasActions ? ' has-actions' : ''}`}>
        {due.rows.length > 0 && <DueCard petId={petId} due={due} dict={dict} />}

        {facts.length > 0 && (
          <section className="card health-facts" aria-labelledby="health-facts-title">
            <h2 id="health-facts-title">{words.important.title}</h2>
            <dl>
              {facts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
            <Link href={medicalRecordHref.form(petId)} className="link">
              {words.important.editInForm}
            </Link>
          </section>
        )}

        <div className="health-sections">
          {sectionCards(dict, overview, today).map((card) => (
            <SectionCardView
              key={card.section}
              card={card}
              href={sectionOpen(card.section, overview.writable) ? medicalRecordHref.section(petId, card.section) : null}
              dict={dict}
            />
          ))}
          <WeightCardView
            card={weightCard(dict, overview, today)}
            href={sectionOpen('weight', overview.writable) ? medicalRecordHref.section(petId, 'weight') : null}
            dict={dict}
          />
          <ChecksCard checks={checks} dict={dict} onRetry={onRetry} retrying={retrying} />
        </div>

        {hasActions && (
          <nav className="health-actions" aria-label={words.actions.label}>
            {addable.length > 0 && (
              <Link href={medicalRecordHref.add(petId)} className="btn primary">
                {words.actions.addRecord}
                <Icon name="plus" />
              </Link>
            )}
            {vetSummary && (
              <Link href={medicalRecordHref.vetSummary(petId)} className="btn secondary">
                {words.actions.forVet}
              </Link>
            )}
          </nav>
        )}
      </div>
    </div>
  )
}

function CardHead({ id, title, href, dict }: { id: string; title: string; href: string | null; dict: Dictionary }) {
  return (
    <div className="health-card-head">
      <h2 id={id}>{title}</h2>
      {href && (
        <Link href={href} className="link" aria-label={dict.medicalRecord.allIn.replace('{section}', title)}>
          {dict.medicalRecord.all}
          <Icon name="arrow" />
        </Link>
      )}
    </div>
  )
}

function DueCard({ petId, due, dict }: { petId: string; due: DueBlock; dict: Dictionary }) {
  const words = dict.medicalRecord.due
  const locale = useLocale()
  const rest = due.total - due.rows.length
  return (
    <section className="card health-due" aria-labelledby="health-due-title">
      <h2 id="health-due-title">{words.title}</h2>
      <DueRows rows={due.rows} dict={dict} />
      {MEDICAL_RECORD_STAGE.due ? (
        <Link href={medicalRecordHref.due(petId)} className="link">
          {words.all.replace('{n}', String(due.total))}
        </Link>
      ) : (
        rest > 0 && <p className="health-due-more">{formatCount(words.more, rest, locale)}</p>
      )}
    </section>
  )
}

/**
 * Due rows — in the record's «Сроки» and on «Все сроки». How far each date
 * is, is said in words with an icon beside it (colour only supports it);
 * overdue is neutral, not a red urgency badge. «Сделано» acts on that one
 * item; a kind the site cannot mark yet (a visit before MW-06) has none.
 */
export function DueRows({ rows, dict }: { rows: DueRow[]; dict: Dictionary }) {
  const words = dict.medicalRecord.due
  return (
    <ul>
      {rows.map((row) => (
        <li key={row.key} className="due-row">
          <Icon name={KIND_ICON[row.kind]} />
          <div className="copy">
            <strong>{row.title}</strong>
            <p className={`due-state ${row.tone}`}>
              {row.tone === 'overdue' && <Icon name="calendarLate" />}
              {row.tone === 'soon' && <Icon name="calendar" />}
              {row.status}
            </p>
          </div>
          {row.completeHref && (
            <Link href={row.completeHref} className="pill due-done" aria-label={row.completeLabel}>
              {words.markDone}
            </Link>
          )}
        </li>
      ))}
    </ul>
  )
}

function SectionCardView({ card, href, dict }: { card: SectionCard; href: string | null; dict: Dictionary }) {
  const titleId = `health-${card.section}-title`
  const lines = card.empty ? [card.empty] : card.lines
  return (
    <section className="card health-section" aria-labelledby={titleId}>
      <CardHead id={titleId} title={card.title} href={href} dict={dict} />
      <ul className="record-lines">
        {lines.map((line) => (
          <li key={line.key} className="record-line">
            <strong>{line.title}</strong>
            <p>{line.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function WeightCardView({ card, href, dict }: { card: WeightCard; href: string | null; dict: Dictionary }) {
  const words = dict.medicalRecord
  return (
    <section className="card health-section wide" aria-labelledby="health-weight-title">
      <CardHead id="health-weight-title" title={words.sections.weight} href={href} dict={dict} />
      {card.kind === 'chart' && (
        <>
          <WeightChart points={card.points} label={card.label} />
          <ul className="sr-only" aria-label={words.weightCard.measurements}>
            {card.points.map((point) => (
              <li key={point.key}>{`${point.dayLabel}: ${point.label}`}</li>
            ))}
          </ul>
        </>
      )}
      {card.kind === 'single' && (
        <div className="weight-single">
          <strong>{card.value}</strong>
          <p>{card.note}</p>
          <p>{words.weightCard.onePoint}</p>
        </div>
      )}
      {card.kind === 'none' && (
        <ul className="record-lines">
          <li className="record-line">
            <strong>{words.weightCard.none}</strong>
            <p>{words.weightCard.noneNote}</p>
          </li>
        </ul>
      )}
    </section>
  )
}

/** A check's day on the owner's clock: the browser's own time zone. */
function checkDay(dict: Dictionary, iso: string): string {
  const when = new Date(iso)
  const day = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`
  return formatDay(dict.medicalRecord, day, when.getFullYear() !== new Date().getFullYear())
}

function ChecksCard({
  checks,
  dict,
  onRetry,
  retrying,
}: {
  checks: ChecksPart
  dict: Dictionary
  onRetry: () => void
  retrying: boolean
}) {
  const words = dict.medicalRecord.checks
  return (
    <section className="card health-section wide" aria-labelledby="health-checks-title">
      <CardHead id="health-checks-title" title={words.title} href={null} dict={dict} />
      {checks.status === 'failed' ? (
        <div className="health-checks-failed" role="alert">
          <p>{words.failed}</p>
          <RetryButton onRetry={onRetry} retrying={retrying} dict={dict} />
        </div>
      ) : checks.items.length === 0 ? (
        <ul className="record-lines">
          <li className="record-line">
            <strong>{words.empty}</strong>
            <p>{words.emptyNote}</p>
          </li>
        </ul>
      ) : (
        <ul className="health-checks">
          {checks.items.map((check: SymptomCheckRecord) => (
            <li key={check.id}>
              <Link href={`/check/${check.id}`} className="health-check">
                <span className="health-check-day">{checkDay(dict, check.created_at)}</span>
                <UrgencyBadge urgency={check.urgency} dict={dict} />
                <span className="health-check-text">{check.symptoms_input}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * «Повторить»: busy while its request runs, then usable again — a failed
 * retry must never leave the owner without a way to try once more.
 */
export function RetryButton({
  onRetry,
  retrying,
  dict,
  className = 'btn secondary',
}: {
  onRetry: () => void
  retrying: boolean
  dict: Dictionary
  className?: string
}) {
  const words = dict.medicalRecord.states
  return (
    <button
      type="button"
      className={className}
      aria-disabled={retrying || undefined}
      onClick={() => {
        if (!retrying) onRetry()
      }}
    >
      {retrying ? words.retrying : words.retry}
    </button>
  )
}
