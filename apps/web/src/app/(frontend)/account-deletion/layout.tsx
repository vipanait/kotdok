import DictionarySlice from '@/components/DictionarySlice'

/** The deletion form. The texts of this route group (shared/i18n/slices.ts). */
export default function AccountDeletionLayout({ children }: { children: React.ReactNode }) {
  return <DictionarySlice route="account-deletion">{children}</DictionarySlice>
}
