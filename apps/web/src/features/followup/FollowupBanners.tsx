'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import type { FollowupCaseSummary } from '@lapka/contracts'
import { FOLLOWUP_STATES } from '@lapka/contracts'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import PetAvatar from '@/components/PetAvatar'
import Icon from '@/components/ui/Icon'
import { browserApi } from '@/features/api/browser-api'
import { clinicSearchUrl } from '@/features/symptom-check/clinic-search'
import { formatCount } from '@/shared/i18n/plural'
import { BANNER_LIMIT, followupHref, formatDay, tomorrowMorning } from './followup-view'

/**
 * «Пора отметить» on the overview (В-2): a banner per pet whose question has
 * come, two at most and «Ещё N случаев» for the rest. An answer here only
 * opens the check-in page with it chosen — the owner sends it there. When the
 * rule already sent the owner to a vet, the clinic comes first.
 */
export default function FollowupBanners({
  cases,
  photosByPet,
  timeZone,
}: {
  /** The cases due now, earliest first (`dueBanners`). */
  cases: FollowupCaseSummary[]
  photosByPet: Record<string, string>
  timeZone: string
}) {
  const dict = useTranslations()
  const locale = useLocale()
  const words = dict.followup
  const [hidden, setHidden] = useState<string[]>([])
  const [expanded, setExpanded] = useState(false)

  const shown = cases.filter((item) => !hidden.includes(item.id))
  if (shown.length === 0) return null
  const visible = expanded ? shown : shown.slice(0, BANNER_LIMIT)
  const more = shown.length - visible.length

  return (
    <div className="followup-banners">
      {visible.map((item) => (
        <Banner
          key={item.id}
          item={item}
          photoUrl={photosByPet[item.pet_id]}
          date={formatDay(item.origin_checked_at, locale, timeZone)}
          onHidden={() => setHidden((list) => [...list, item.id])}
        />
      ))}
      {more > 0 && (
        <button type="button" className="link followup-more" onClick={() => setExpanded(true)}>
          {formatCount(words.bannerMore, more, locale)}
          <Icon name="chevron" />
        </button>
      )}
    </div>
  )
}

function Banner({
  item,
  photoUrl,
  date,
  onHidden,
}: {
  item: FollowupCaseSummary
  photoUrl?: string
  date: string
  onHidden: () => void
}) {
  const dict = useTranslations()
  const words = dict.followup
  const ids = useId()
  const [hiding, setHiding] = useState(false)
  const [failed, setFailed] = useState(false)
  const escalated = item.escalation !== 'none'
  const asksVet = item.next_slot === 'vet'
  const title = words.bannerTitle.replace('{name}', () => item.pet_name).replace('{date}', date)

  async function hide() {
    if (hiding) return
    setHiding(true)
    setFailed(false)
    try {
      // Tomorrow 09:00 on this browser's clock; the case stays open.
      await browserApi().snoozeFollowup(item.id, tomorrowMorning(new Date()).toISOString())
      onHidden()
    } catch {
      setFailed(true)
      setHiding(false)
    }
  }

  const escalationText =
    item.escalation === 'clinic_now'
      ? words.clinicNowTitle
      : item.escalation === 'see_vet_today'
        ? words.seeVetTodayTitle
        : item.escalation === 'see_vet'
          ? words.seeVetTitle
          : null

  return (
    <section className={`followup-banner${escalated ? ' is-escalated' : ''}`} aria-labelledby={`${ids}-title`}>
      <div className="followup-banner-head">
        <PetAvatar species={item.pet_species} photoUrl={photoUrl} size={48} />
        <div>
          <p className="eyebrow">{words.bannerEyebrow}</p>
          <h2 id={`${ids}-title`}>{title}</h2>
        </div>
      </div>
      {escalationText && <p className="followup-banner-alert">{escalationText}</p>}
      <p className="followup-banner-body">{asksVet ? words.bannerBodyVet : words.bannerBody}</p>

      <div className="followup-banner-actions">
        {escalated ? (
          <div className="row followup-banner-answers">
            <a href={clinicSearchUrl(dict.check.clinicSearchQuery)} target="_blank" rel="noopener noreferrer" className="btn primary">
              {dict.check.findClinic}
              <Icon name="arrow" />
            </a>
            <Link href={followupHref.checkin(item.id, { from: 'banner' })} className="btn secondary">
              {words.bannerCheckin}
            </Link>
          </div>
        ) : (
          <div
            className="row followup-banner-answers"
            role="group"
            aria-label={words.bannerAnswers.replace('{name}', () => item.pet_name)}
          >
            {FOLLOWUP_STATES.map((state) => (
              <Link key={state} href={followupHref.checkin(item.id, { answer: state, from: 'banner' })} className="btn secondary">
                {words.states[state]}
              </Link>
            ))}
          </div>
        )}
        <button
          type="button"
          className="link followup-banner-hide"
          onClick={() => void hide()}
          aria-disabled={hiding || undefined}
          aria-describedby={failed ? `${ids}-error` : undefined}
        >
          {hiding ? words.offerSaving : words.bannerHide}
        </button>
      </div>
      {failed && (
        <p id={`${ids}-error`} className="banner error followup-error" role="alert">
          {words.bannerHideFailed}
        </p>
      )}
    </section>
  )
}
