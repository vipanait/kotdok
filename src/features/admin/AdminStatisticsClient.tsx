'use client'

import { useRouter } from 'next/navigation'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
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
    { label: t.symptomChecks, value: formatNumber(statistics.totals.symptomChecks, locale) },
    { label: t.symptomChecksCat, value: formatNumber(statistics.totals.symptomChecksCat, locale) },
    { label: t.symptomChecksDog, value: formatNumber(statistics.totals.symptomChecksDog, locale) },
    { label: t.petsTotal, value: formatNumber(statistics.totals.petsTotal, locale) },
    { label: t.petsCat, value: formatNumber(statistics.totals.petsCat, locale) },
    { label: t.petsDog, value: formatNumber(statistics.totals.petsDog, locale) },
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
            title={t.symptomChecksChart}
            points={statistics.daily}
            valueKey="symptomChecks"
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
  valueKey: keyof Pick<AdminStatisticsDailyPoint, 'registrations' | 'payments' | 'paymentAmount' | 'symptomChecks'>
  locale: string
  formatValue?: (value: number) => string
}) {
  const values = points.map(point => point[valueKey])
  const latest = values.at(-1) ?? 0
  const total = values.reduce((sum, value) => sum + value, 0)

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
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`${valueKey}-gradient`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.32} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={value => formatDate(value, locale)}
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              minTickGap={18}
            />
            <YAxis
              width={44}
              tickFormatter={value => compactValue(Number(value), locale)}
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#9ca3af', fontSize: 11 }}
            />
            <Tooltip
              cursor={{ stroke: '#fed7aa', strokeWidth: 2 }}
              content={<ChartTooltip locale={locale} formatValue={formatValue} />}
            />
            <Area
              type="monotone"
              dataKey={valueKey}
              stroke="#f97316"
              strokeWidth={3}
              fill={`url(#${valueKey}-gradient)`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, fill: '#fff', stroke: '#f97316' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
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

function formatDate(value: string | undefined, locale: string): string {
  if (!value) return ''
  return new Date(value).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'short',
  })
}

function ChartTooltip({
  active,
  payload,
  label,
  locale,
  formatValue,
}: {
  active?: boolean
  payload?: Array<{ value?: number | string | null }>
  label?: string | number
  locale: string
  formatValue: (value: number) => string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-xl border border-gray-100 bg-white/95 px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-gray-700">{formatDate(String(label), locale)}</div>
      <div className="mt-1 font-semibold text-orange-600">
        {formatValue(Number(payload[0]?.value ?? 0))}
      </div>
    </div>
  )
}
