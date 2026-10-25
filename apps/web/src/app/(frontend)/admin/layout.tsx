import DictionarySlice from '@/components/DictionarySlice'

/** The statistics. The texts of this route group (shared/i18n/slices.ts). */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <DictionarySlice route="admin">{children}</DictionarySlice>
}
