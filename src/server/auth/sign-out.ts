import 'server-only'

import { createClient } from '@/server/supabase/server'

export async function signOutCurrentUser() {
  const supabase = await createClient()
  await supabase.auth.signOut()
}
