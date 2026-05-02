'use client'

import Link from 'next/link'
import LapkaLogo from './LapkaLogo'
import { useTranslations } from './LocaleProvider'

interface Props {
  heading: string
  subheading?: string
  topRight?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}

export default function AuthShell({ heading, subheading, topRight, children, footer }: Props) {
  const dict = useTranslations()
  const home = dict.home
  return (
    <div className="min-h-screen bg-[#F7F6F4] text-black">
      <div className="relative mx-auto flex min-h-screen max-w-[1200px] flex-col px-10 py-10 lg:min-h-[760px]">
        <header className="flex items-start justify-between">
          <Link href="/" aria-label="Лапка" className="block">
            <LapkaLogo />
          </Link>
          {topRight && (
            <div className="text-sm font-bold text-black/[.44]">
              {topRight}
            </div>
          )}
        </header>

        <div className="mt-12 grid flex-1 gap-12 lg:mt-[60px] lg:grid-cols-[minmax(0,636px)_minmax(0,1fr)] lg:items-start">
          {/* Left: heading */}
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
              {heading}
            </h1>
            {subheading && (
              <p
                className="mt-12 max-w-[564px] font-semibold text-black/[.44]"
                style={{ fontSize: '22px', lineHeight: '27px', letterSpacing: '-0.03em' }}
              >
                {subheading}
              </p>
            )}

            <div className="mt-12 flex flex-wrap items-center gap-6 lg:mt-auto lg:pt-16">
              <Link
                href="/register"
                className="flex h-[140px] w-[140px] shrink-0 items-center justify-center rounded-full bg-[#FC7A00] px-6 text-center text-[17px] font-semibold leading-[21px] text-white transition-colors hover:bg-[#e36c00]"
              >
                {home.checkSymptoms}
              </Link>

              <ul className="flex items-stretch gap-5 text-sm font-bold leading-[17px]">
                {[home.tag1, home.tag2, home.tag3].map((tag, i) => (
                  <li key={tag} className={i > 0 ? 'flex items-center gap-5' : undefined}>
                    {i > 0 && <span className="w-px self-stretch bg-[#D9D9D9]" aria-hidden />}
                    <span className="max-w-[118px] whitespace-pre-line">{tag}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right: form card */}
          <div className="lg:pt-2">
            <div className="rounded-[28px] bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.15)] p-6 sm:p-8">
              {children}
            </div>
            {footer && (
              <div className="mt-6 text-center text-sm text-black/[.44]">{footer}</div>
            )}
          </div>
        </div>

        <p className="mt-10 text-sm font-bold text-black/[.44]">
          {dict.common.vetDisclaimer}
        </p>
      </div>
    </div>
  )
}
