import type { Metadata } from 'next'
import DictionarySlice from '@/components/DictionarySlice'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

/**
 * Fixtures previews of screens whose server is not built yet. Each page
 * answers 404 unless the server runs with LAPKA_UI_FIXTURES=1 (ruling R1 of
 * the documents design run), so real users never reach them.
 */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  return <DictionarySlice route="dev">{children}</DictionarySlice>
}
