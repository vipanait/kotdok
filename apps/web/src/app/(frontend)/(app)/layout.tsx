import type { Metadata } from 'next'
import DictionarySlice from '@/components/DictionarySlice'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <DictionarySlice route="(app)">{children}</DictionarySlice>
}
