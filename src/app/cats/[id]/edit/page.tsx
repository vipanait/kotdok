import type { Metadata } from 'next'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import CatForm from '../../CatForm'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function EditCatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { data: cat } = await service
    .from('cats')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!cat) notFound()

  return <CatForm cat={cat} />
}
