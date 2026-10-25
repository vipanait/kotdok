import DictionarySlice from '@/components/DictionarySlice'

/** The check form and its result. The texts of this route group (shared/i18n/slices.ts). */
export default function CheckLayout({ children }: { children: React.ReactNode }) {
  return <DictionarySlice route="check">{children}</DictionarySlice>
}
