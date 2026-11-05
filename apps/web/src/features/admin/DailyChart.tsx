'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import type { AdminDaily } from '@/shared/types/admin'
import { compactValue, formatDate, formatNumber } from './format'

/**
 * The palette of the design system (design-system.css). Recharts draws SVG
 * with presentation attributes, where `var(--…)` does not resolve, so the
 * values are repeated here; pages.css overrides text colour and font.
 */
export const CHART = {
  grid: '#EFE6D8',
  axis: '#6E675B',
  cursor: 'rgb(221 239 235 / 0.55)',
  teal: '#0B6B5E',
  sand: '#C9A46A',
  emergency: '#C2412D',
  urgent: '#E08A3C',
  monitor: '#E3C35A',
  home_care: '#7FB89A',
  healthy: '#B8C7D9',
}

export interface ChartSeries<K extends string> {
  key: K
  label: string
  color: string
}

/** Bars by Moscow day, one or several series, side by side or stacked. */
export default function DailyChart<K extends string>({
  id,
  title,
  data,
  series,
  stacked = false,
}: {
  id: string
  title: string
  data: AdminDaily<K>
  series: ChartSeries<K>[]
  stacked?: boolean
}) {
  const locale = useLocale()
  const t = useTranslations().admin.statistics
  const totals = series.map(s => data.reduce((sum, point) => sum + point[s.key], 0))
  const total = totals.reduce((sum, value) => sum + value, 0)
  const from = formatDate(data[0]?.date, locale)
  const to = formatDate(data.at(-1)?.date, locale)
  const headingId = `admin-chart-${id}`

  return (
    <section className="card admin-chart" aria-labelledby={headingId}>
      <div className="admin-chart-head">
        <h2 id={headingId}>{title}</h2>
        <dl className="admin-chart-figures">
          {series.map((s, index) => (
            <div key={s.key}>
              <dt>
                <i className="admin-swatch" style={{ background: s.color }} aria-hidden /> {s.label}
              </dt>
              <dd>{formatNumber(totals[index] ?? 0, locale)}</dd>
            </div>
          ))}
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
            data={data}
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
            <Tooltip cursor={{ fill: CHART.cursor }} content={<ChartTooltip locale={locale} series={series} />} />
            {series.map(s => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color}
                stackId={stacked ? 'day' : undefined}
                radius={stacked ? 0 : [2, 2, 0, 0]}
                isAnimationActive={false}
              />
            ))}
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

function ChartTooltip<K extends string>({
  active,
  payload,
  label,
  locale,
  series,
}: {
  active?: boolean
  payload?: Array<{ dataKey?: string | number; value?: number | string | null }>
  label?: string | number
  locale: string
  series: ChartSeries<K>[]
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="admin-chart-tooltip">
      <span>{formatDate(String(label), locale)}</span>
      {series.map(s => {
        const value = payload.find(item => item.dataKey === s.key)?.value
        return (
          <span key={s.key}>
            {s.label}: <strong>{formatNumber(Number(value ?? 0), locale)}</strong>
          </span>
        )
      })}
    </div>
  )
}
