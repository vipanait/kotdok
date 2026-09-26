'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { localToday, type WeightPeriod } from '@lapka/shared'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import { RecordProblem, StaleNotice } from '../MedicalRecordScreen'
import { medicalRecordHref, sectionOpen } from '../stage'
import { useMedicalRecord } from '../use-medical-record'
import WeightChart from '../WeightChart'
import { WEIGHT_PERIODS, weightPage, type WeightSaved } from './weight-view'

/**
 * `/pets/[id]/health/weight` (web v1, «weight», «weight-one»): the current
 * weight and the trend over a chosen period, the chart — or a sentence when
 * the period has fewer than two points — and every measurement as a table
 * a screen reader can walk, each with its own «Изменить».
 */
export default function WeightScreen({ petId, saved }: { petId: string; saved: WeightSaved | null }) {
  const dict = useTranslations()
  const locale = useLocale()
  const words = dict.medicalRecord
  const page = words.weightPage
  const { state, reload } = useMedicalRecord(petId)
  const [today] = useState(() => localToday())
  const [period, setPeriod] = useState<WeightPeriod>('halfYear')

  if (state.status !== 'ready') {
    return <RecordProblem state={state} petId={petId} reload={reload} loading={<WeightSkeleton title={page.title} label={words.states.loading} />} />
  }

  const { overview } = state.data
  const editable = sectionOpen('weight', overview.writable)
  const view = weightPage(dict, locale, overview, period, today, editable)
  const { summary } = view

  return (
    <div className="health-page weight-page">
      <Link href={medicalRecordHref.record(petId)} className="link health-back">
        <Icon name="back" />
        {page.back}
      </Link>

      <div className="pagehead">
        <div>
          <h1>{page.title}</h1>
          <p>{view.subtitle}</p>
        </div>
        {editable && (
          <Link href={medicalRecordHref.newRecord(petId, 'weight')} className="btn primary">
            {page.add}
            <Icon name="plus" />
          </Link>
        )}
      </div>

      {saved && <SavedNotice text={page.saved[saved]} />}
      <StaleNotice state={state} reload={reload} />

      <div className="section-layout">
        <div className="section-main">
          <section className="card weight-summary" aria-labelledby="weight-current">
            <div className="segmented weight-periods" role="group" aria-label={page.periodLabel}>
              {WEIGHT_PERIODS.map((value) => (
                <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)}>
                  {page.periods[value]}
                </button>
              ))}
            </div>

            {summary.kind === 'none' ? (
              <>
                <h2 id="weight-current">{summary.title}</h2>
                <p>{summary.body}</p>
              </>
            ) : (
              <>
                <h2 id="weight-current" className="weight-current">{summary.current}</h2>
                {summary.kind === 'chart' ? (
                  <>
                    {summary.trend && <p>{summary.trend}</p>}
                    <WeightChart points={summary.points} label={summary.label} height={200} className="weight-chart-large" />
                    <ul className="sr-only" aria-label={page.pointsLabel}>
                      {summary.points.map((point) => (
                        <li key={point.key}>{`${point.dayLabel}: ${point.label}`}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  // Fewer than two points in the period: no line, a sentence — announced when the period changes.
                  <p aria-live="polite">{summary.text}</p>
                )}
              </>
            )}
          </section>

          {view.rows.length > 0 && (
            <section className="card weight-list" aria-labelledby="weight-list-title">
              <h2 id="weight-list-title">{page.measurements}</h2>
              <table className="record-table">
                <thead>
                  <tr>
                    <th scope="col">{page.columns.day}</th>
                    <th scope="col">{page.columns.weight}</th>
                    {editable && (
                      <th scope="col">
                        <span className="sr-only">{page.columns.action}</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((row) => (
                    <tr key={row.key}>
                      <td>
                        {row.day}
                        {row.note && <span className="record-table-note">{row.note}</span>}
                      </td>
                      <td>{row.value}</td>
                      {editable && (
                        <td className="record-table-action">
                          {row.action && (
                            <Link href={row.action.href} className="link" aria-label={row.action.ariaLabel}>
                              {row.action.label}
                            </Link>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>

        <aside className="section-aside">
          <div className="card health-facts">
            <h2>{page.asideTitle}</h2>
            <p>{page.asideBody}</p>
          </div>
        </aside>
      </div>
    </div>
  )
}

/**
 * The confirmation after a save or a delete, once: it takes focus so a
 * screen reader reads it, and leaves the address so a reload does not
 * confirm again.
 */
function SavedNotice({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
    const url = new URL(window.location.href)
    url.searchParams.delete('saved')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  }, [])
  return (
    <div ref={ref} tabIndex={-1} role="status" className="banner toast-banner health-saved">
      {text}
    </div>
  )
}

function WeightSkeleton({ title, label }: { title: string; label: string }) {
  return (
    <div className="health-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="pagehead" aria-hidden>
        <div>
          <h1>{title}</h1>
        </div>
      </div>
      <div className="section-layout" aria-hidden>
        <div className="skeleton-block weight-skeleton-main" />
        <div className="skeleton-block weight-skeleton-aside" />
      </div>
    </div>
  )
}
