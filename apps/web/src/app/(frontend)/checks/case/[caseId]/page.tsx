import Link from 'next/link'
import { UuidSchema } from '@lapka/contracts'
import CabinetShell from '@/components/cabinet/CabinetShell'
import { requireCabinet } from '@/components/cabinet/require-cabinet'
import Icon from '@/components/ui/Icon'
import UrgencyBadge from '@/components/ui/UrgencyBadge'
import CaseActions from '@/features/followup/CaseActions'
import CaseContextCard from '@/features/followup/CaseContextCard'
import CaseNotFound from '@/features/followup/CaseNotFound'
import NextQuestionLine from '@/features/followup/NextQuestionLine'
import {
  answerLabel,
  caseSpan,
  caseStatusLabel,
  caseTimeline,
  followupHref,
  formatDay,
  formatDayRange,
  formatDayTime,
  petLineOf,
  type TimelineEvent,
} from '@/features/followup/followup-view'
import { medicalRecordHref } from '@/features/medical-record/routes'
import { loadFollowupCasePage } from '@/server/checks/load-followup-pages'
import { getDictionary } from '@/server/i18n/get-dictionary'
import { getLocale } from '@/server/i18n/get-locale'
import { getTimeZone } from '@/server/i18n/get-time-zone'
import { privatePageMetadata } from '@/server/i18n/page-metadata'
import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { petSummary } from '@/shared/utils/pet-summary'

export const generateMetadata = privatePageMetadata(d => d.followup.timelineCrumb)

/**
 * One case as a timeline (FU-07, В-4): its checks, the answers, visits
 * recorded against its checks and its closing, oldest first, in the owner's
 * time zone. Beside it the pet and what can be done with the case. Signed
 * in only; someone else's case is «not found».
 */
export default async function CaseTimelinePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params
  const cabinet = await requireCabinet(`/login?next=${encodeURIComponent(followupHref.timeline(caseId))}`)
  const [locale, timeZone] = await Promise.all([getLocale(), getTimeZone()])
  const dict = await getDictionary(locale)
  const words = dict.followup

  const page = UuidSchema.safeParse(caseId).success ? await loadFollowupCasePage(cabinet.user.id, caseId) : null
  if (!page) {
    return (
      <CabinetShell cabinet={cabinet} active="history" crumb={words.timelineCrumb}>
        <CaseNotFound dict={dict} />
      </CabinetShell>
    )
  }

  const item = page.case
  const events = caseTimeline(item)
  const span = caseSpan(item)
  const latestCheckId = item.checks.at(-1)?.check_id ?? item.origin_check_id

  return (
    <CabinetShell cabinet={cabinet} active="history" crumb={words.timelineCrumb}>
      <div className="pagehead">
        <div>
          <h1 className="followup-title">{words.timelineTitle.replace('{name}', () => item.pet_name)}</h1>
          <p>{`${formatDayRange(span.from, span.to, locale, timeZone)} · ${caseStatusLabel(words, item)}`}</p>
        </div>
        <Link href="/checks" className="link">
          <Icon name="back" />
          {words.allHistory}
        </Link>
      </div>

      <div className="care-columns followup-columns">
        <div>
          <section className="card" aria-label={words.timelineCrumb}>
            <ol className="followup-timeline">
              {events.map((event) => (
                <TimelineItem key={event.key} event={event} petId={item.pet_id} dict={dict} locale={locale} timeZone={timeZone} />
              ))}
            </ol>
            {item.status === 'active' && item.checkins.length === 0 && item.next_due_at && (
              <NextQuestionLine dueAt={item.next_due_at} template="noCheckinsYet" className="followup-timeline-empty" />
            )}
            {item.status === 'active' && item.checkins.length > 0 && item.next_due_at && (
              <NextQuestionLine dueAt={item.next_due_at} template="offerNext" className="followup-timeline-empty" />
            )}
          </section>
        </div>

        <aside className="stack">
          <CaseContextCard
            item={item}
            petLine={petLineOf(item.pet_species, page.pet ? petSummary(page.pet, dict, locale) : '', dict)}
            dict={dict}
            locale={locale}
            timeZone={timeZone}
          />
          <CaseActions item={item} latestCheckId={latestCheckId} />
        </aside>
      </div>
    </CabinetShell>
  )
}

function TimelineItem({
  event,
  petId,
  dict,
  locale,
  timeZone,
}: {
  event: TimelineEvent
  petId: string
  dict: Dictionary
  locale: Locale
  timeZone: string
}) {
  const words = dict.followup
  switch (event.kind) {
    case 'check':
      return (
        <li className="followup-event">
          <time dateTime={event.at}>{formatDayTime(event.at, locale, timeZone)}</time>
          <h2>{event.check.kind === 'origin' ? words.eventCheck : words.eventRecheck}</h2>
          <UrgencyBadge urgency={event.check.urgency} dict={dict} />
          {event.check.symptoms && <p>{event.check.symptoms}</p>}
          <Link href={`/check/${event.check.check_id}`} className="link">
            {words.openResult}
            <Icon name="arrow" />
          </Link>
        </li>
      )
    case 'checkin':
      return (
        <li className="followup-event">
          <time dateTime={event.at}>{formatDayTime(event.at, locale, timeZone)}</time>
          <h2>{answerLabel(words, event.checkin)}</h2>
          {event.checkin.note && <p className="followup-event-note">{event.checkin.note}</p>}
        </li>
      )
    case 'visit':
      return (
        <li className="followup-event">
          <time dateTime={event.visit.date}>{formatDay(`${event.visit.date}T12:00:00.000Z`, locale, 'UTC')}</time>
          <h2>{event.visit.status === 'planned' ? words.eventVisitPlanned : words.eventVisitDone}</h2>
          {event.visit.clinic && <p>{event.visit.clinic}</p>}
          <Link href={medicalRecordHref.recordView(petId, event.visit.event_id)} className="link">
            {words.openVisit}
            <Icon name="arrow" />
          </Link>
        </li>
      )
    case 'closed':
      return (
        <li className="followup-event">
          <time dateTime={event.at}>{formatDayTime(event.at, locale, timeZone)}</time>
          <h2>{words.eventClosed}</h2>
          <p>{words.outcomes[event.outcome]}</p>
        </li>
      )
  }
}
