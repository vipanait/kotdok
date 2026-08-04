import { redirect } from 'next/navigation'

/** Legacy /cats/[id]/edit → /pets/[id]/edit */
export default async function LegacyEditCatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/pets/${id}/edit`)
}
