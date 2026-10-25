import DictionarySlice from '@/components/DictionarySlice'

/** The history and the follow-up cases. The texts of this route group (shared/i18n/slices.ts). */
export default function ChecksLayout({ children }: { children: React.ReactNode }) {
  return <DictionarySlice route="checks">{children}</DictionarySlice>
}
