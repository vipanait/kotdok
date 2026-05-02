'use client'

import { useRouter } from 'next/navigation'
import { useMemo } from 'react'
import { useLocale, useTranslations } from '@/components/LocaleProvider'
import type { AdminStatistics, AdminStatisticsDailyPoint, AdminStatisticsPeriod } from '@/shared/types/admin'
import { formatMoney } from '@/shared/utils/billing-format'

interface Props {
  statistics: AdminStatistics
}

const PERIODS: AdminStatisticsPeriod[] = [7, 30, 90]

export default function AdminStatisticsClient({ statistics }: Props) {
  const router = useRouter()
  const locale = useLocale()
  const dict = useTranslations()
  const t = dict.admin.statistics

  const cards = [
    { label: t.registeredUsers, value: formatNumber(statistics.totals.registeredUsers, locale) },
    { label: t.payingUsers, value: formatNumber(statistics.totals.payingUsers, locale) },
    { label: t.symptomCheckUsers, value: formatNumber(statistics.totals.symptomCheckUsers, locale) },
    { label: t.totalRevenue, value: formatMoney(statistics.totals.totalRevenue, statistics.currency) },
  ]

  function changePeriod(days: AdminStatisticsPeriod) {
    router.replace(`/admin/statistics?days=${days}`)
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        {cards.map(card => (
          <div key={card.label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="text-xs text-gray-500">{card.label}</div>
            <div className="mt-2 text-2xl font-bold text-gray-900">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">{t.chartTitle}</h2>
            <p className="text-xs text-gray-500">{t.chartSubtitle}</p>
          </div>
          <div className="flex rounded-xl bg-gray-100 p-1">
            {PERIODS.map(days => (
              <button
                key={days}
                type="button"
                onClick={() => changePeriod(days)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  statistics.days === days
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.days.replace('{n}', String(days))}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <LineChart
            title={t.registrationsChart}
            points={statistics.daily}
            valueKey="registrations"
            locale={locale}
          />
          <LineChart
            title={t.paymentsChart}
            points={statistics.daily}
            valueKey="payments"
            locale={locale}
          />
          <LineChart
            title={t.paymentAmountChart}
            points={statistics.daily}
            valueKey="paymentAmount"
            locale={locale}
            formatValue={value => formatMoney(value, statistics.currency)}
          />
        </div>
      </div>
    </div>
  )
}

function LineChart({
  title,
  points,
  valueKey,
  locale,
  formatValue = value => formatNumber(value, locale),
}: {
  title: string
  points: AdminStatisticsDailyPoint[]
  valueKey: keyof Pick<AdminStatisticsDailyPoint, 'registrations' | 'payments' | 'paymentAmount'>
  locale: string
  formatValue?: (value: number) => string
}) {
  const values = points.map(point => point[valueKey])
  const max = Math.max(...values, 0)
  const latest = values.at(-1) ?? 0
  const total = values.reduce((sum, value) => sum + value, 0)
  const path = useMemo(() => buildPath(values, max), [values, max])

  return (
    <section className="rounded-xl border border-gray-100 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          <p className="text-xs text-gray-400">
            {formatDate(points[0]?.date, locale)} - {formatDate(points.at(-1)?.date, locale)}
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-gray-900">{formatValue(total)}</div>
          <div className="text-xs text-gray-400">{formatValue(latest)}</div>
        </div>
      </div>
      <svg viewBox="0 0 320 120" role="img" aria-label={title} className="h-32 w-full overflow-visible">
        <line x1="0" y1="104" x2="320" y2="104" stroke="currentColor" className="text-gray-100" />
        {path ? (
          <>
            <path d={path.area} fill="currentColor" className="text-orange-100" />
            <path d={path.line} fill="none" stroke="currentColor" strokeWidth="3" className="text-orange-500" />
          </>
        ) : (
          <line x1="0" y1="104" x2="320" y2="104" stroke="currentColor" strokeWidth="3" className="text-orange-200" />
        )}
      </svg>
    </section>
  )
}

function buildPath(values: number[], max: number): { line: string; area: string } | null {
  if (!values.length) return null

  const width = 320
  const top = 12
  const bottom = 104
  const range = bottom - top
  const denominator = Math.max(values.length - 1, 1)
  const coordinates = values.map((value, index) => {
    const x = (index / denominator) * width
    const y = max > 0 ? bottom - (value / max) * range : bottom
    return { x, y }
  })
  const line = coordinates
    .map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ')
  const first = coordinates[0]
  const last = coordinates[coordinates.length - 1]

  return {
    line,
    area: `${line} L ${last.x.toFixed(2)} ${bottom} L ${first.x.toFixed(2)} ${bottom} Z`,
  }
}

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US').format(value)
}

function formatDate(value: string | undefined, locale: string): string {
  if (!value) return ''
  return new Date(value).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'short',
  })
}
