import { createClient, createServiceClient } from '@/lib/supabase/server'
import CheckForm from './CheckForm'
import type { Cat } from '@/types'

export default async function CheckPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let cats: Pick<Cat, 'id' | 'name' | 'breed' | 'age_years' | 'sex'>[] = []
  if (user) {
    const service = createServiceClient()
    const { data } = await service
      .from('cats')
      .select('id, name, breed, age_years, sex')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
    cats = data ?? []
  }

  return <CheckForm cats={cats} />
}
