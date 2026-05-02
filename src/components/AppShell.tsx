import Link from 'next/link'
import LapkaLogo from './LapkaLogo'

interface Props {
  children: React.ReactNode
  logoHref?: string
  right?: React.ReactNode
}

export default function AppShell({ children, logoHref = '/', right }: Props) {
  return (
    <div className="min-h-screen px-4 py-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <Link href={logoHref}>
          <LapkaLogo height={32} />
        </Link>
        {right}
      </div>
      {children}
    </div>
  )
}
