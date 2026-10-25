import DictionarySlice from '@/components/DictionarySlice'

/** The pet form and the first steps read their texts here; the record of one pet adds its own below. The texts of this route group (shared/i18n/slices.ts). */
export default function PetsLayout({ children }: { children: React.ReactNode }) {
  return <DictionarySlice route="pets">{children}</DictionarySlice>
}
