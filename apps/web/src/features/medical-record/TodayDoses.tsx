'use client'

import { doseKey, type TodayDose } from '@lapka/shared'
import { useTranslations } from '@/components/LocaleProvider'
import Icon from '@/components/ui/Icon'
import type { TodayDosesState } from './doses/use-today-doses'

/**
 * «Сегодня» (design `record`, `medication`): each dose of today with its
 * time, medicine and dosage, and «Дали». Once the server has the mark, the
 * row says «Дали» under the dosage and offers «Отменить» — which takes off
 * this one mark only, never the course. While a press is on its way the
 * button is busy; a failure says so and leaves the dose as it was.
 */
export default function TodayDoses({
  title,
  doses,
  today,
  headingId,
  showName = true,
}: {
  title: string
  doses: TodayDosesState
  today: string
  headingId: string
  /** The medicine's name on each row; left out on the course's own page. */
  showName?: boolean
}) {
  const t = useTranslations().medicalRecord.doses
  const name = (dose: TodayDose) => dose.course.name
  const errorText = (reason: string) =>
    reason === 'offline' ? t.errors.offline : reason === 'signedOut' ? t.errors.signedOut : t.errors.failed

  return (
    <section className="card today-doses" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      {doses.status === 'failed' && (
        <div className="today-doses-failed" role="alert">
          <p>{t.loadFailed}</p>
          <button type="button" className="link" onClick={doses.reload}>
            {t.retry}
          </button>
        </div>
      )}
      <ul>
        {doses.rows.map((dose) => {
          const key = doseKey(dose.course.id, today, dose.slot)
          const busy = doses.pending.has(key)
          const given = dose.state === 'given'
          const what = `${name(dose)}, ${dose.slot}`
          return (
            <li key={key} className="dose-row">
              <strong className="dose-time">{dose.slot}</strong>
              <div className="dose-copy">
                {showName && <span className="dose-name">{name(dose)}</span>}
                {dose.course.dosage && <small>{dose.course.dosage}</small>}
                {given && (
                  <small className="dose-given">
                    <Icon name="check" />
                    {t.given}
                  </small>
                )}
                {doses.error?.key === key && (
                  <small className="field-error" role="alert">
                    {errorText(doses.error.reason)}
                  </small>
                )}
              </div>
              {doses.status !== 'ready' ? null : given ? (
                <button
                  type="button"
                  className="link dose-undo"
                  aria-label={t.undoLabel.replace('{what}', () => what)}
                  aria-disabled={busy || undefined}
                  onClick={() => {
                    if (!busy) doses.unmark(dose)
                  }}
                >
                  {busy ? t.saving : t.undo}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn secondary compact"
                  aria-label={t.giveLabel.replace('{what}', () => what)}
                  aria-disabled={busy || undefined}
                  onClick={() => {
                    if (!busy) doses.mark(dose)
                  }}
                >
                  {busy ? t.saving : t.give}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
