import 'server-only'

import { randomUUID } from 'node:crypto'
import { PHOTO_LIMITS, type UploadGrant, type UploadRequest } from '@lapka/contracts'
import type { createServiceClient } from '@/server/supabase/server'

type SupabaseService = ReturnType<typeof createServiceClient>

/**
 * Photos in private Storage (stage 6/01).
 *
 * The phone never sends a photo through our server — Vercel would cut the body
 * off at 4.5 MB. It asks here for a signed upload URL per file and writes the
 * file there itself. A signed upload URL lets exactly one object be created at
 * exactly one path, and with `upsert: false` it cannot replace one.
 *
 * Nothing is kept: a photo is removed right after its analysis, and anything
 * never attached to a check is swept once the signed URL — two hours, fixed by
 * Storage — can no longer write it.
 */

export const PHOTO_BUCKET = 'check-photos'

/** Two hours of signed URL, plus room for a slow last write. */
export const SWEEP_AFTER_SECONDS = 3 * 60 * 60

/** @returns the grants, or null when Storage or the database did not answer — no row is left behind then. */
export async function grantUploads(
  supabase: SupabaseService,
  userId: string,
  files: UploadRequest['files'],
  now: Date = new Date(),
): Promise<UploadGrant | null> {
  const expiresAt = new Date(now.getTime() + PHOTO_LIMITS.grantSeconds * 1000).toISOString()
  const rows = files.map((file) => {
    const id = randomUUID()
    return {
      id,
      user_id: userId,
      object_path: `${userId}/${id}`,
      content_type: file.content_type,
      size_bytes: file.size_bytes,
      expires_at: expiresAt,
    }
  })

  const { error: insertError } = await supabase.from('photo_uploads').insert(rows)
  if (insertError) {
    console.error('[photo-uploads] grant_insert_failed')
    return null
  }

  const uploads: UploadGrant['uploads'] = []
  for (const row of rows) {
    const { data, error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUploadUrl(row.object_path, { upsert: false })
    if (error || !data) {
      console.error('[photo-uploads] grant_sign_failed')
      await supabase.from('photo_uploads').delete().in('id', rows.map((r) => r.id))
      return null
    }
    uploads.push({
      upload_id: row.id,
      url: data.signedUrl,
      method: 'PUT',
      headers: { 'content-type': row.content_type, 'x-upsert': 'false' },
      expires_at: expiresAt,
    })
  }

  return { uploads }
}

/**
 * Objects first, rows second: a row left behind tells the sweeper where the
 * object is; an object left without a row would be found only by listing.
 * Never throws — a photo that outlives its check by a day is swept, a check
 * that fails because cleanup did is worse.
 */
export async function removeUploads(
  supabase: SupabaseService,
  uploads: { id: string; object_path: string }[],
): Promise<void> {
  if (uploads.length === 0) return

  const { error: storageError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .remove(uploads.map((upload) => upload.object_path))
  if (storageError) {
    console.error('[photo-uploads] remove_objects_failed')
    return
  }

  const { error } = await supabase
    .from('photo_uploads')
    .delete()
    .in('id', uploads.map((upload) => upload.id))
  if (error) console.error('[photo-uploads] remove_rows_failed')
}

/**
 * Everything under one person's folder, whether or not a row still points at
 * it. Used by account deletion, which must not leave a photo behind because a
 * row was lost. Throws, so the worker counts a failed attempt.
 */
export async function removeUserPhotos(supabase: SupabaseService, userId: string): Promise<void> {
  const bucket = supabase.storage.from(PHOTO_BUCKET)
  for (;;) {
    const { data, error } = await bucket.list(userId, { limit: 100 })
    if (error) throw new Error('list failed')
    if (!data || data.length === 0) break
    const { error: removeError } = await bucket.remove(data.map((object) => `${userId}/${object.name}`))
    if (removeError) throw new Error('remove failed')
  }

  const { error } = await supabase.from('photo_uploads').delete().eq('user_id', userId)
  if (error) throw new Error('rows delete failed')
}

/** @returns how many abandoned uploads were removed. */
export async function sweepExpiredUploads(
  supabase: SupabaseService,
  now: Date = new Date(),
  limit = 200,
): Promise<number> {
  const cutoff = new Date(now.getTime() - SWEEP_AFTER_SECONDS * 1000).toISOString()
  const { data, error } = await supabase
    .from('photo_uploads')
    .select('id, object_path')
    .lt('created_at', cutoff)
    .order('created_at')
    .limit(limit)
  if (error) throw new Error('sweep select failed')
  if (!data || data.length === 0) return 0

  const { error: storageError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .remove(data.map((upload) => upload.object_path))
  if (storageError) throw new Error('sweep remove failed')

  const { error: deleteError } = await supabase
    .from('photo_uploads')
    .delete()
    .in('id', data.map((upload) => upload.id))
  if (deleteError) throw new Error('sweep delete failed')
  return data.length
}
