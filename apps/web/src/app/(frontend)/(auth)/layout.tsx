import type { Metadata } from 'next'
import DictionarySlice from '@/components/DictionarySlice'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <DictionarySlice route="(auth)">{children}</DictionarySlice>
}
