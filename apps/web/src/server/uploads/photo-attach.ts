import 'server-only'

import type { ErrorCode } from '@lapka/contracts'
import type { createServiceClient } from '@/server/supabase/server'
import type { AnalysisPhoto } from '@/server/symptom-check/analyze-symptom-check'
import { PHOTO_BUCKET, removeUploads } from '@/server/uploads/photo-storage'
import { verifyPhoto } from '@/server/uploads/photo-verify'

type SupabaseService = ReturnType<typeof createServiceClient>

export type ClaimedUpload = { id: string; object_path: string }

export type LoadedPhotos =
  | { ok: true; photos: AnalysisPhoto[]; uploads: ClaimedUpload[] }
  | { ok: false; code: ErrorCode; message: string }

/**
 * Turns upload ids into photos an analysis can be given (stage 6/02).
 *
 * Runs before anything is charged: a missing, foreign, expired or fake photo
 * refuses the check while no job and no credit exist. The bytes checked here
 * are the bytes the AI receives — they are never fetched again by URL — so
 * nothing written to storage after the check can change what was analysed.
 *
 * Once claimed, an upload belongs to this check alone. If it cannot be used,
 * it is removed on the spot: the phone uploads afresh on its next try.
 */
export async function loadPhotosForCheck(
  supabase: SupabaseService,
  userId: string,
  uploadIds: string[],
): Promise<LoadedPhotos> {
  const { data, error } = await supabase.rpc('claim_photo_uploads', {
    p_user_id: userId,
    p_ids: uploadIds,
  })
  if (error) {
    if (error.message.includes('uploads_unavailable')) {
      return { ok: false, code: 'bad_request', message: 'Фото устарели или недоступны, загрузите их заново' }
    }
    console.error('[photo-uploads] claim_failed')
    return { ok: false, code: 'internal_error', message: 'Не удалось принять фото' }
  }

  const uploads = (data ?? []) as ClaimedUpload[]
  const photos: AnalysisPhoto[] = []
  for (const upload of uploads) {
    const { data: file, error: downloadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .download(upload.object_path)
    if (downloadError || !file) {
      await removeUploads(supabase, uploads)
      return { ok: false, code: 'bad_request', message: 'Фото не догрузилось, отправьте его ещё раз' }
    }

    const verdict = verifyPhoto(new Uint8Array(await file.arrayBuffer()))
    if (!verdict.ok) {
      await removeUploads(supabase, uploads)
      return { ok: false, code: verdict.code, message: verdict.message }
    }
    photos.push(verdict.photo)
  }

  return { ok: true, photos, uploads }
}
