import 'server-only'

import { signAvatars } from '@/server/pets/avatar-service'
import { createServiceClient } from '@/server/supabase/server'

/**
 * The owner's photos of their live pets, as short-lived signed links by pet
 * id. Only decoration: a failed read or signing leaves the species drawings.
 */
export async function loadPetPhotos(userId: string): Promise<Record<string, string>> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('pets')
    .select('id, avatar_path')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .not('avatar_path', 'is', null)
  if (error || !data) return {}
  const rows = data as { id: string; avatar_path: string | null }[]
  const urls = await signAvatars(service, rows.map((row) => row.avatar_path))
  const photos: Record<string, string> = {}
  rows.forEach((row, index) => {
    const url = urls[index]
    if (url) photos[row.id] = url
  })
  return photos
}
