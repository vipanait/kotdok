'use client'

import { useLocale, useTranslations } from '@/components/LocaleProvider'
import type { AdminAnswers } from '@/shared/types/admin'
import { answerLabels } from './answer-labels'
import { formatPercent } from './format'
import ShareBars from './ShareBars'

const QUESTIONS = ['appetite', 'activity', 'duration', 'stool'] as const

/** How the quick questionnaire was answered over the checks of the period. */
export default function AnswersBlock({ answers }: { answers: AdminAnswers }) {
  const locale = useLocale()
  const dict = useTranslations()
  const t = dict.admin.dashboard.checks
  const labels = answerLabels(dict.check)
  const { any, ...signs } = answers.pain

  return (
    <section className="card admin-section" aria-labelledby="admin-answers">
      <h2 id="admin-answers">{t.answersTitle}</h2>
      <p className="small muted">{t.answersHint}</p>
      <div className="admin-answers">
        {QUESTIONS.map(question => {
          const counts = answers[question] as Record<string, number>
          const names = labels[question] as Record<string, string>
          return (
            <div key={question}>
              <h3>{labels.questions[question]}</h3>
              <ShareBars
                label={labels.questions[question]}
                items={Object.entries(counts).map(([value, count]) => ({
                  label: value === 'unanswered' ? t.unanswered : names[value] ?? value,
                  count,
                }))}
              />
            </div>
          )
        })}
        <div>
          <h3>{t.painTitle}</h3>
          <p className="small">
            {t.painAny.replace('{share}', formatPercent(answers.total === 0 ? null : any / answers.total, locale))}
          </p>
          <ul className="admin-shares" aria-label={t.painTitle}>
            {Object.entries(signs).map(([sign, count]) => (
              <li key={sign}>
                <span className="admin-share-label">{labels.pain[sign as keyof typeof labels.pain]}</span>
                <span className="admin-share-bar" aria-hidden>
                  <i style={{ width: `${answers.total === 0 ? 0 : Math.round((count / answers.total) * 100)}%` }} />
                </span>
                <span className="admin-share-value">{formatPercent(answers.total === 0 ? null : count / answers.total, locale)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
