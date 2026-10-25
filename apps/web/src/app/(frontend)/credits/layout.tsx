import DictionarySlice from '@/components/DictionarySlice'

/** The balance card. The texts of this route group (shared/i18n/slices.ts). */
export default function CreditsLayout({ children }: { children: React.ReactNode }) {
  return <DictionarySlice route="credits">{children}</DictionarySlice>
}
