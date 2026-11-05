'use client'

import { useTranslations } from '@/components/LocaleProvider'
import type { AdminCheckRow } from '@/shared/types/admin'
import { answerLabels, answerText } from './answer-labels'

/** A whole check as the owner got it, opened from a feed row. */
export default function CheckDetails({ row }: { row: AdminCheckRow }) {
  const dict = useTranslations()
  const d = dict.admin.dashboard
  const t = d.checks.details
  const labels = answerLabels(dict.check)

  const answers = [
    ...(['appetite', 'activity', 'duration', 'stool'] as const)
      .filter(question => row.answers[question])
      .map(question => `${labels.questions[question]}: ${answerText(labels, question, row.answers[question]!)}`),
    ...(row.answers.painSigns.length > 0
      ? [`${labels.questions.pain}: ${row.answers.painSigns.map(sign => labels.pain[sign as keyof typeof labels.pain] ?? sign).join(', ')}`]
      : []),
  ]

  return (
    <dl className="admin-check-details">
      <dt>{t.symptoms}</dt>
      <dd className="admin-check-symptoms">{row.symptoms}</dd>
      {row.urgencyReason && (
        <>
          <dt>{t.reason}</dt>
          <dd>{row.urgencyReason}</dd>
        </>
      )}
      <List title={t.causes} items={row.possibleCauses} />
      <List title={t.homeCare} items={row.homeCareSteps} />
      <List title={t.vetQuestions} items={row.vetQuestions} />
      <List title={t.answers} items={answers} />
      {row.rating && (
        <>
          <dt>{t.feedback}</dt>
          <dd>
            {d.rating[row.rating]} {row.comment ? `«${row.comment}»` : ''}
          </dd>
        </>
      )}
    </dl>
  )
}

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <>
      <dt>{title}</dt>
      <dd>
        <ul>
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </dd>
    </>
  )
}
