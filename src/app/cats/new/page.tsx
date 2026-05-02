import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CatForm from '../CatForm'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function NewCatPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/cats/new')

  return <CatForm />
}
