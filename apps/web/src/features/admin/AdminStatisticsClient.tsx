'use client'

import Link, { useLinkStatus } from 'next/link'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import { formatCount } from '@/shared/i18n/plural'
import type { AdminFollowupStatistics, AdminStatistics, AdminStatisticsDailyPoint, AdminStatisticsPeriod } from '@/shared/types/admin'

interface Props {
  statistics: AdminStatistics
}

const PERIODS: AdminStatisticsPeriod[] = [7, 30, 90]

/**
 * The palette of the design system (design-system.css). Recharts draws SVG
 * with presentation attributes, where `var(--…)` does not resolve, so the
 * values are repeated here; pages.css overrides text colour and font.
 */
const CHART = {
  bar: '#DDEFEB',
  barTop: '#0B6B5E',
  grid: '#EFE6D8',
  axis: '#6E675B',
  cursor: 'rgb(221 239 235 / 0.55)',
}

export default function AdminStatisticsClient({ statistics }: Props) {
  const locale = useLocale()
  const dict = useTranslations()
  const t = dict.admin.statistics

  // Row by row as in the concept: people and pets, then the split by species.
  const cards = [
    { label: t.registeredUsers, value: statistics.totals.registeredUsers },
    { label: t.symptomCheckUsers, value: statistics.totals.symptomCheckUsers },
    { label: t.symptomChecks, value: statistics.totals.symptomChecks },
    { label: t.petsTotal, value: statistics.totals.petsTotal },
    { label: t.symptomChecksCat, value: statistics.totals.symptomChecksCat },
    { label: t.symptomChecksDog, value: statistics.totals.symptomChecksDog },
    { label: t.petsCat, value: statistics.totals.petsCat },
    { label: t.petsDog, value: statistics.totals.petsDog },
  ]

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
        <div className="admin-period">
          <span id="admin-period-label" className="admin-period-label">{t.period}</span>
          <div className="segmented" role="group" aria-labelledby="admin-period-label">
            {PERIODS.map(days => (
              <Link
                key={days}
                href={`/admin/statistics?days=${days}`}
                replace
                scroll={false}
                aria-current={statistics.days === days ? 'true' : undefined}
              >
                <PeriodLabel text={formatCount(t.periodDays, days, locale)} />
              </Link>
            ))}
          </div>
        </div>
      </div>

      <section aria-label={t.totalsLabel} className="stats">
        {cards.map(card => (
          <div key={card.label} className="card stat">
            <span className="small muted">{card.label}</span>
            <strong>{formatNumber(card.value, locale)}</strong>
          </div>
        ))}
      </section>

      <div className="grid2 admin-charts">
        <DailyChart
          title={t.registrationsChart}
          points={statistics.daily}
          valueKey="registrations"
          locale={locale}
        />
        <DailyChart
          title={t.symptomChecksChart}
          points={statistics.daily}
          valueKey="symptomChecks"
          locale={locale}
        />
      </div>

      <FollowupStatistics data={statistics.followup} locale={locale} />
    </>
  )
}

/** Below this many, a percentage says more than it knows. */
const PERCENT_FROM = 10

function share(part: number, of: number, locale: string): string {
  const count = formatNumber(part, locale)
  if (of < PERCENT_FROM) return `${count} (${formatNumber(of, locale)})`
  return `${count} · ${Math.round((part / of) * 100)}% (${formatNumber(of, locale)})`
}

/**
 * What became of pets after a check (FU-04): offered and turned on, answered,
 * the first answer by level, the rule's vet advice, visits, re-checks, how the
 * cases ended. Counted in SQL, over cases whose first check is in the period.
 */
function FollowupStatistics({ data, locale }: { data: AdminFollowupStatistics; locale: string }) {
  const t = useTranslations().admin.statistics
  const sources = Object.entries(data.firstSource).sort((a, b) => b[1] - a[1])
  return (
    <section className="card admin-followup" aria-labelledby="admin-followup-title">
      <h2 id="admin-followup-title">{t.followupTitle}</h2>
      <p className="small muted">{t.followupSubtitle}</p>
      <div className="admin-table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">{t.followupLevel}</th>
              <th scope="col">{t.followupOffered}</th>
              <th scope="col">{t.followupEnabled}</th>
              <th scope="col">{t.followupAnswered}</th>
              <th scope="col">{t.followupFirst}</th>
              <th scope="col">{t.followupEscalated}</th>
              <th scope="col">{t.followupVet}</th>
              <th scope="col">{t.followupRecheck}</th>
              <th scope="col">{t.followupMedian}</th>
              <th scope="col">{t.followupSaved}</th>
              <th scope="col">{t.followupOutcomes}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map(row => {
              const outcomes = Object.entries(row.outcomes)
                .filter(([, count]) => count > 0)
                .map(([name, count]) => `${t.followupOutcomeNames[name as keyof typeof row.outcomes]} ${formatNumber(count, locale)}`)
              if (row.open > 0) outcomes.push(`${t.followupOpen} ${formatNumber(row.open, locale)}`)
              return (
                <tr key={row.urgency}>
                  <th scope="row">{t.followupUrgency[row.urgency]}</th>
                  <td>{formatNumber(row.offered, locale)}</td>
                  <td>{share(row.enabled, row.offered, locale)}</td>
                  <td>{share(row.answered, row.enabled, locale)}</td>
                  <td>
                    {row.answered === 0
                      ? '—'
                      : [row.firstBetter, row.firstSame, row.firstWorse].map(count => share(count, row.answered, locale)).join(' / ')}
                  </td>
                  <td>{share(row.escalated, row.enabled, locale)}</td>
                  <td>{row.firstVetAsked === 0 ? '—' : share(row.firstVetYes, row.firstVetAsked, locale)}</td>
                  <td>{row.rechecked === 0 ? '0' : `${formatNumber(row.rechecked, locale)} (${formatNumber(row.recheckRaised, locale)})`}</td>
                  <td>{row.medianHoursToBetter === null ? '—' : t.followupHours.replace('{n}', formatNumber(row.medianHoursToBetter, locale))}</td>
                  <td>{share(row.savedToRecord, row.outcomes.improved, locale)}</td>
                  <td>{outcomes.length > 0 ? outcomes.join(', ') : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <h3>{t.followupSources}</h3>
      <p className="small">
        {sources.length === 0
          ? t.followupNoSources
          : sources.map(([name, count]) => `${t.followupSourceNames[name] ?? name}: ${formatNumber(count, locale)}`).join(' · ')}
      </p>
    </section>
  )
}

/** The period being loaded dims until its page arrives. */
function PeriodLabel({ text }: { text: string }) {
  const { pending } = useLinkStatus()
  return <span className={pending ? 'is-pending' : undefined}>{text}</span>
}

function DailyChart({
  title,
  points,
  valueKey,
  locale,
}: {
  title: string
  points: AdminStatisticsDailyPoint[]
  valueKey: keyof Pick<AdminStatisticsDailyPoint, 'registrations' | 'symptomChecks'>
  locale: string
}) {
  const t = useTranslations().admin.statistics
  const values = points.map(point => point[valueKey])
  const latest = values.at(-1) ?? 0
  const total = values.reduce((sum, value) => sum + value, 0)
  const from = formatDate(points[0]?.date, locale)
  const to = formatDate(points.at(-1)?.date, locale)
  const headingId = `admin-chart-${valueKey}`

  return (
    <section className="card admin-chart" aria-labelledby={headingId}>
      <div className="admin-chart-head">
        <h2 id={headingId}>{title}</h2>
        <dl className="admin-chart-figures">
          <div>
            <dt>{t.periodTotal}</dt>
            <dd>{formatNumber(total, locale)}</dd>
          </div>
          <div>
            <dt>{t.lastDay}</dt>
            <dd>{formatNumber(latest, locale)}</dd>
          </div>
        </dl>
      </div>

      <div
        className="admin-chart-plot"
        role="img"
        aria-label={t.chartAria
          .replace('{title}', title)
          .replace('{total}', formatNumber(total, locale))
          .replace('{from}', from)
          .replace('{to}', to)}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={points}
            margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
            barCategoryGap="18%"
            // The plot is one image with a spoken summary; keyboard stepping
            // through 90 bars would sit inside it unannounced.
            accessibilityLayer={false}
          >
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="date" tick={false} tickLine={false} axisLine={{ stroke: CHART.grid }} height={1} />
            <YAxis
              width={36}
              allowDecimals={false}
              tickFormatter={value => compactValue(Number(value), locale)}
              tickLine={false}
              axisLine={false}
              tick={{ fill: CHART.axis, fontSize: 11 }}
            />
            <Tooltip
              cursor={{ fill: CHART.cursor }}
              content={<ChartTooltip locale={locale} />}
            />
            <Bar dataKey={valueKey} isAnimationActive={false} shape={BarShape} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="admin-chart-range" aria-hidden>
        <span>{from}</span>
        <span>{to}</span>
      </div>

      {total === 0 && <p className="footnote admin-chart-empty">{t.noData}</p>}
    </section>
  )
}

/** A mint column with a teal cap, as in the concept. */
function BarShape(props: unknown) {
  const { x = 0, y = 0, width = 0, height = 0 } = props as {
    x?: number
    y?: number
    width?: number
    height?: number
  }
  if (height <= 0 || width <= 0) return <g />
  const cap = Math.min(3, height)
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={Math.min(3, width / 2)} fill={CHART.bar} />
      <rect x={x} y={y} width={width} height={cap} rx={Math.min(1.5, width / 2)} fill={CHART.barTop} />
    </g>
  )
}

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US').format(value)
}

function compactValue(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

/** Day keys are UTC dates ("2026-09-23"); read them as such in any time zone. */
function formatDate(value: string | undefined, locale: string): string {
  if (!value) return ''
  return new Date(value).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}

function ChartTooltip({
  active,
  payload,
  label,
  locale,
}: {
  active?: boolean
  payload?: Array<{ value?: number | string | null }>
  label?: string | number
  locale: string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="admin-chart-tooltip">
      <span>{formatDate(String(label), locale)}</span>
      <strong>{formatNumber(Number(payload[0]?.value ?? 0), locale)}</strong>
    </div>
  )
}
