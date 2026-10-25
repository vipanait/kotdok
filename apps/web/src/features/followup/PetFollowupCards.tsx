'use client'

import { useEffect, useId, useState } from 'react'
import Link from 'next/link'
import type { FollowupCaseSummary, PastEpisode } from '@lapka/contracts'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import UrgencyBadge from '@/components/ui/UrgencyBadge'
import { browserApi } from '@/features/api/browser-api'
import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { useBrowserClock } from './use-browser-clock'
import { EPISODE_LIMIT, followupHref, formatDay, formatDayRange, recentEpisodes } from './followup-view'

type Loaded<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'failed' }

/**
 * The pet's follow-up for its health record (FU-07, В-5): its open case and
 * its «Перенесённые случаи», read through the v1 API like the rest of the
 * record. Either part only adds to the record: while loading, empty or
 * failed it shows nothing rather than an error under the record.
 */
export function usePetFollowup(petId: string): { active: FollowupCaseSummary | null; episodes: PastEpisode[] } {
  const [active, setActive] = useState<Loaded<FollowupCaseSummary | null>>({ status: 'loading' })
  const [episodes, setEpisodes] = useState<Loaded<PastEpisode[]>>({ status: 'loading' })

  useEffect(() => {
    let current = true
    const api = browserApi()
    api
      .listFollowups()
      .then((list) => current && setActive({ status: 'ready', data: list.items.find((item) => item.pet_id === petId) ?? null }))
      .catch(() => current && setActive({ status: 'failed' }))
    api
      .listPastEpisodes(petId)
      .then((list) => current && setEpisodes({ status: 'ready', data: list.items }))
      .catch(() => current && setEpisodes({ status: 'failed' }))
    return () => {
      current = false
    }
  }, [petId])

  return {
    active: active.status === 'ready' ? active.data : null,
    episodes: episodes.status === 'ready' ? episodes.data : [],
  }
}

/** «Наблюдаем»: the pet's open case, with a check-in when its question has come. */
export function ActiveCaseCard({ item }: { item: FollowupCaseSummary | null }) {
  const dict = useTranslations()
  const locale = useLocale()
  const words = dict.followup
  const clock = useBrowserClock()
  if (!item) return null
  const now = clock?.getTime() ?? null
  const due =
    now !== null &&
    item.next_due_at !== null &&
    new Date(item.next_due_at).getTime() <= now &&
    (item.hidden_until === null || new Date(item.hidden_until).getTime() <= now)

  return (
    <section className="card followup-active" aria-labelledby="followup-active-title">
      <div className="followup-active-copy">
        <h2 id="followup-active-title">{words.activeTitle}</h2>
        <UrgencyBadge urgency={item.current_urgency} dict={dict} />
        <p className="followup-active-check">{words.activeCheck.replace('{date}', formatDay(item.origin_checked_at, locale))}</p>
        {item.symptoms && <p className="small">{item.symptoms}</p>}
        {due && <p className="small">{words.activeDue}</p>}
        <Link href={followupHref.timeline(item.id)} className="link">
          {words.openTimeline}
          <Icon name="arrow" />
        </Link>
      </div>
      <Link href={followupHref.checkin(item.id, { from: 'record' })} className="btn secondary">
        {words.bannerCheckin}
      </Link>
    </section>
  )
}

function EpisodeRow({ episode, dict, locale }: { episode: PastEpisode; dict: Dictionary; locale: Locale }) {
  const words = dict.followup
  return (
    <li>
      <Link href={followupHref.timeline(episode.case_id)} className="followup-episode">
        <strong>{episode.symptoms || words.historyCase}</strong>
        <span className="small">
          {`${formatDayRange(episode.started_at, episode.closed_at, locale)} · ${words.outcomes[episode.outcome].toLocaleLowerCase(locale)}`}
        </span>
        <UrgencyBadge urgency={episode.origin_urgency} dict={dict} />
      </Link>
    </li>
  )
}

/**
 * «Перенесённые случаи»: three at most, then «Все случаи · N» opens the rest
 * right here — they are the N saved cases, not the whole history of checks.
 * Nothing at all when there are none.
 */
export function PastEpisodesCard({ episodes }: { episodes: PastEpisode[] }) {
  const dict = useTranslations()
  const locale = useLocale()
  const words = dict.followup
  const listId = useId()
  const [expanded, setExpanded] = useState(false)
  if (episodes.length === 0) return null
  const shown = expanded ? episodes : episodes.slice(0, EPISODE_LIMIT)
  return (
    <section className="card followup-episodes" aria-labelledby="followup-episodes-title">
      <h2 id="followup-episodes-title">{words.episodesTitle}</h2>
      <ul id={listId}>
        {shown.map((episode) => (
          <EpisodeRow key={episode.case_id} episode={episode} dict={dict} locale={locale} />
        ))}
      </ul>
      {episodes.length > EPISODE_LIMIT && !expanded && (
        <button type="button" className="link" aria-controls={listId} aria-expanded={false} onClick={() => setExpanded(true)}>
          {words.episodesAll.replace('{n}', String(episodes.length))}
          <Icon name="chevron" />
        </button>
      )}
      <p className="small followup-episodes-note">{words.episodesNote}</p>
    </section>
  )
}

/**
 * «Перенесённые случаи за 6 месяцев» in the summary for a vet, on screen and
 * on paper. Read on its own: the summary itself does not carry them yet.
 */
export function VetSummaryEpisodes({ petId }: { petId: string }) {
  const dict = useTranslations()
  const locale = useLocale()
  const words = dict.followup
  const [episodes, setEpisodes] = useState<PastEpisode[]>([])

  useEffect(() => {
    let current = true
    browserApi()
      .listPastEpisodes(petId)
      .then((list) => current && setEpisodes(recentEpisodes(list.items, new Date())))
      // Optional on the summary: left out rather than an error on paper.
      .catch(() => current && setEpisodes([]))
    return () => {
      current = false
    }
  }, [petId])

  if (episodes.length === 0) return null
  return (
    <section className="card vet-card vet-keep" aria-labelledby="vet-episodes-title">
      <h2 id="vet-episodes-title">{words.episodesSummaryTitle}</h2>
      <ul className="vet-checks">
        {episodes.map((episode) => (
          <li key={episode.case_id} className="vet-check">
            <strong className="vet-check-day">{formatDayRange(episode.started_at, episode.closed_at, locale)}</strong>
            <UrgencyBadge urgency={episode.origin_urgency} dict={dict} className="vet-check-level" />
            <span className="vet-check-text">{`${episode.symptoms} · ${words.outcomes[episode.outcome].toLocaleLowerCase(locale)}`}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
