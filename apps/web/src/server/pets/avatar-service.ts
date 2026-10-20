import 'server-only'

import { randomUUID } from 'node:crypto'
import type { AvatarGrant } from '@lapka/contracts'
import type { createServiceClient } from '@/server/supabase/server'
import { verifyPhoto } from '@/server/uploads/photo-verify'

type SupabaseService = ReturnType<typeof createServiceClient>

/**
 * A pet's photo (FB-4), kept in its own private bucket until it is replaced,
 * removed, or goes with the pet or the account.
 *
 * As with a check's photos, the phone writes the file straight to Storage
 * through a signed URL (Vercel refuses big bodies) and then names the path.
 * The path is checked to be this person's and this pet's, the bytes are
 * checked to be a picture, and only then does the pet point at it.
 */

export const AVATAR_BUCKET = 'pet-avatars'

/** How long a read link lives: long enough for a screen, short enough not to be shared. */
const READ_SECONDS = 60 * 60

/** A grant's two hours of signed URL, plus room for a slow write. */
const SWEEP_AFTER_SECONDS = 3 * 60 * 60

export type AvatarFailure = 'not_found' | 'unsupported_media_type' | 'payload_too_large' | 'storage_error'

async function ownPet(supabase: SupabaseService, userId: string, petId: string) {
  const { data, error } = await supabase
    .from('pets')
    .select('id, avatar_path')
    .eq('id', petId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) return { ok: false as const, reason: 'storage_error' as const }
  if (!data) return { ok: false as const, reason: 'not_found' as const }
  return { ok: true as const, avatarPath: (data.avatar_path as string | null) ?? null }
}

export async function grantAvatar(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  contentType: string,
  now: Date = new Date(),
): Promise<{ ok: true; grant: AvatarGrant } | { ok: false; reason: AvatarFailure }> {
  const pet = await ownPet(supabase, userId, petId)
  if (!pet.ok) return pet

  const path = `${userId}/${petId}/${randomUUID()}`
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUploadUrl(path, { upsert: false })
  if (error || !data) return { ok: false, reason: 'storage_error' }
  return {
    ok: true,
    grant: {
      path,
      url: data.signedUrl,
      method: 'PUT',
      headers: { 'content-type': contentType, 'x-upsert': 'false' },
      expires_at: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    },
  }
}

/**
 * The pet shows the uploaded file from now on; the one it showed before goes.
 * A file that is not a picture is removed and refused.
 */
export async function confirmAvatar(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  path: string,
): Promise<{ ok: true } | { ok: false; reason: AvatarFailure }> {
  const pet = await ownPet(supabase, userId, petId)
  if (!pet.ok) return pet
  // Only a path this grant could have made: this person, this pet, one file.
  if (!new RegExp(`^${userId}/${petId}/[0-9a-f-]{36}$`).test(path)) return { ok: false, reason: 'not_found' }

  const bucket = supabase.storage.from(AVATAR_BUCKET)
  const { data: file, error: downloadError } = await bucket.download(path)
  if (downloadError || !file) return { ok: false, reason: 'not_found' }

  const verdict = verifyPhoto(new Uint8Array(await file.arrayBuffer()))
  if (!verdict.ok) {
    await bucket.remove([path])
    return { ok: false, reason: verdict.code }
  }

  // Only a live pet: one deleted since the check above takes no photo, and
  // the file it would have shown goes now rather than being kept by a row.
  const { data: updated, error } = await supabase
    .from('pets')
    .update({ avatar_path: path })
    .eq('id', petId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, reason: 'storage_error' }
  if (!updated) {
    await bucket.remove([path])
    return { ok: false, reason: 'not_found' }
  }

  // The pet has moved on; an old file left behind is swept, not shown.
  if (pet.avatarPath && pet.avatarPath !== path) await bucket.remove([pet.avatarPath])
  return { ok: true }
}

export async function removeAvatar(
  supabase: SupabaseService,
  userId: string,
  petId: string,
): Promise<{ ok: true } | { ok: false; reason: AvatarFailure }> {
  const pet = await ownPet(supabase, userId, petId)
  if (!pet.ok) return pet
  if (!pet.avatarPath) return { ok: true }

  const { error } = await supabase
    .from('pets')
    .update({ avatar_path: null })
    .eq('id', petId)
    .eq('user_id', userId)
    .is('deleted_at', null)
  if (error) return { ok: false, reason: 'storage_error' }
  await supabase.storage.from(AVATAR_BUCKET).remove([pet.avatarPath])
  return { ok: true }
}

/** A deleted pet's photo, if it had one. Never throws: the sweep catches what is left. */
export async function removeDeletedPetAvatar(supabase: SupabaseService, avatarPath: string | null): Promise<void> {
  if (!avatarPath) return
  const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([avatarPath])
  if (error) console.error('[pet-avatars] remove_failed')
}

/** Short-lived read links, in the order given; null where there is no photo or signing failed. */
export async function signAvatars(supabase: SupabaseService, paths: readonly (string | null)[]): Promise<(string | null)[]> {
  const present = paths.filter((path): path is string => path !== null)
  if (present.length === 0) return paths.map(() => null)

  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrls(present, READ_SECONDS)
  if (error || !data) return paths.map(() => null)
  const byPath = new Map(data.map((entry) => [entry.path, entry.signedUrl ?? null]))
  return paths.map((path) => (path === null ? null : (byPath.get(path) ?? null)))
}

/** Everything under one person's folder: account deletion's `photos` step. Throws on failure. */
export async function removeUserAvatars(supabase: SupabaseService, userId: string): Promise<void> {
  const bucket = supabase.storage.from(AVATAR_BUCKET)
  const { data: folders, error } = await bucket.list(userId, { limit: 1000 })
  if (error) throw new Error('avatar list failed')
  for (const folder of folders ?? []) {
    const prefix = `${userId}/${folder.name}`
    const { data: files, error: listError } = await bucket.list(prefix, { limit: 1000 })
    if (listError) throw new Error('avatar list failed')
    if (!files || files.length === 0) continue
    const { error: removeError } = await bucket.remove(files.map((file) => `${prefix}/${file.name}`))
    if (removeError) throw new Error('avatar remove failed')
  }
}

/** Uploads never confirmed, or left by a replacement whose removal failed. @returns how many went. */
export async function sweepAvatars(supabase: SupabaseService, now: Date = new Date(), batch = 200): Promise<number> {
  const cutoff = new Date(now.getTime() - SWEEP_AFTER_SECONDS * 1000).toISOString()
  let removed = 0
  for (let i = 0; i < 50; i++) {
    const { data, error } = await supabase.rpc('stale_avatar_objects', { p_cutoff: cutoff, p_limit: batch })
    if (error) throw new Error('avatar sweep select failed')
    const names = (data ?? []) as string[]
    if (names.length === 0) break
    const { error: removeError } = await supabase.storage.from(AVATAR_BUCKET).remove(names)
    if (removeError) throw new Error('avatar sweep remove failed')
    removed += names.length
  }
  return removed
}
