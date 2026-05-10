import Link from 'next/link'
import LapkaLogo from './LapkaLogo'

interface Props {
  children: React.ReactNode
  logoHref?: string
  right?: React.ReactNode
  /** Constrain content width. Defaults to "narrow" (max-w-2xl) like the dashboard. */
  width?: 'narrow' | 'wide'
}

/**
 * Cream-canvas shell used by every cabinet page (dashboard, billing, cats,
 * pricing, return, dummy checkout). Matches the new design system from the
 * standalone reference template.
 */
export default function AppShell({ children, logoHref = '/', right, width = 'narrow' }: Props) {
  const max = width === 'wide' ? 'max-w-3xl' : 'max-w-2xl'
  return (
    <div className={`min-h-screen px-4 py-8 ${max} mx-auto`}>
      <div className="flex items-center justify-between mb-8">
        <Link href={logoHref} aria-label="Лапка" className="block">
          <LapkaLogo height={40} />
        </Link>
        <div className="text-sm text-text-muted">{right}</div>
      </div>
      {children}
    </div>
  )
}
