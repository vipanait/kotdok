import type { Metadata } from 'next'
import Link from 'next/link'
import LapkaLogo from '@/components/LapkaLogo'
import { getLocale } from '@/server/i18n/get-locale'
import { getDictionary } from '@/server/i18n/get-dictionary'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import { createClient } from '@/server/supabase/server'

export const metadata: Metadata = {
  title: 'Лапка — экстренная проверка симптомов кошки',
  description: 'Когда с питомцем что-то не так, важно быстро понять, насколько срочная ситуация. Короткий опрос подскажет, нужно ли наблюдать, записаться к врачу или действовать срочно.',
  alternates: { canonical: 'https://lapka.my' },
  openGraph: { url: 'https://lapka.my' },
}

export default async function Home() {
  const locale = await getLocale()
  const dict = await getDictionary(locale)
  const t = dict.home

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-[#F7F6F4] text-black">
      <div className="relative mx-auto max-w-[1200px] px-10 py-10 lg:h-[760px]">
        {/* Header */}
        <header className="flex items-start justify-between">
          <Link href="/" aria-label="Лапка" className="block">
            <LapkaLogo />
          </Link>
          <Link
            href={user ? '/dashboard' : '/login'}
            className="text-sm font-bold text-black/[.44] hover:text-black/70 transition-colors"
          >
            {user ? dict.dashboard.title : t.signIn}
          </Link>
        </header>

        {/* Two-column area */}
        <div className="mt-12 grid gap-12 lg:mt-[60px] lg:grid-cols-[minmax(0,636px)_minmax(0,1fr)]">
          {/* Left column */}
          <div className="flex flex-col">
            <h1
              className="font-black text-black"
              style={{
                fontSize: 'clamp(40px, 6vw, 60px)',
                lineHeight: 1,
                letterSpacing: '-0.02em',
                fontWeight: 860,
              }}
            >
              {t.hero}
            </h1>

            <p
              className="mt-12 max-w-[564px] font-semibold text-black/[.44]"
              style={{ fontSize: '22px', lineHeight: '27px', letterSpacing: '-0.03em' }}
            >
              {t.description}
            </p>

            <div className="mt-auto pt-16 flex flex-wrap items-center gap-6">
              <Link
                href="/register"
                className="flex h-[140px] w-[140px] shrink-0 items-center justify-center rounded-full bg-[#FC7A00] text-white text-center font-semibold text-[17px] leading-[21px] hover:bg-[#e36c00] transition-colors px-6"
              >
                {t.checkSymptoms}
              </Link>

              <ul className="flex items-stretch gap-5 text-sm font-bold leading-[17px]">
                {[t.tag1, t.tag2, t.tag3].map((tag, i) => (
                  <li key={i} className={i > 0 ? 'flex items-center gap-5' : undefined}>
                    {i > 0 && <span className="w-px bg-[#D9D9D9] self-stretch" aria-hidden />}
                    <span className="max-w-[118px] whitespace-pre-line">{tag}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="mt-10 text-sm font-bold text-black/[.44]">
              {dict.common.vetDisclaimer}
            </p>
          </div>

          {/* Right column: app preview */}
          <div className="relative hidden lg:block">
            <AppPreview t={t} />
          </div>
        </div>
      </div>
    </div>
  )
}

function AppPreview({ t }: { t: Dictionary['home'] }) {
  const p = t.preview
  return (
    <div className="absolute -top-2 left-0 right-0 overflow-hidden rounded-[28px] bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.15)]">
      <div className="space-y-5 p-6">
        <div className="flex items-center gap-3 rounded-2xl bg-orange-50 p-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-200 text-2xl">🐱</div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">{p.selectedPet}</p>
            <p className="text-base font-semibold">{p.catName}</p>
            <p className="text-xs text-gray-500">{p.catDetails}</p>
          </div>
          <span className="rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-medium text-orange-700">
            {p.profileFilled}
          </span>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">{p.describeSymptoms}</h3>
            <span className="text-lg text-gray-400">×</span>
          </div>
          <p className="mt-1 text-xs text-gray-500">{p.moreDetail}</p>
        </div>

        <ChipGroup label={p.appetiteLabel} options={p.appetiteOptions} active={0} />
        <ChipGroup label={p.activityLabel} options={p.activityOptions} active={0} />
        <ChipGroup label={p.durationLabel} options={p.durationOptions} active={2} />
        <ChipGroup label={p.stoolLabel} options={p.stoolOptions} active={0} />

        <div className="rounded-xl border border-gray-200 px-4 py-3 text-xs text-gray-400">
          {p.symptomsPlaceholder}
        </div>

        <div className="rounded-xl border border-dashed border-gray-300 py-5 text-center">
          <div className="text-2xl">📷</div>
          <p className="mt-1 text-sm font-semibold">{p.addPhoto}</p>
          <p className="text-[11px] text-gray-400">{p.photoHint}</p>
        </div>
      </div>
    </div>
  )
}

function ChipGroup({ label, options, active }: { label: string; options: string[]; active: number }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt, i) => (
          <span
            key={opt}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              i === active
                ? 'border-orange-300 bg-orange-50 text-orange-700'
                : 'border-gray-200 bg-white text-gray-700'
            }`}
          >
            {opt}
          </span>
        ))}
      </div>
    </div>
  )
}
