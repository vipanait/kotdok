import { redirect } from 'next/navigation'

/** Legacy /cats/new → /pets/new */
export default function LegacyNewCatPage() {
  redirect('/pets/new')
}
