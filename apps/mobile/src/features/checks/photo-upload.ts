import type { UploadGrant, UploadRequest } from '@lapka/contracts'
import type { PickedPhoto, PreparedPhoto } from './photos'

/**
 * Sending photos: ask the server where, then write each file there directly.
 *
 * The server never sees the bytes on the way in — its host refuses bodies over
 * 4.5 MB — so this is two steps, and a check is only created once both are done.
 */

export type UploadDeps = {
  prepare(photo: PickedPhoto): Promise<PreparedPhoto>
  requestUploads(body: UploadRequest): Promise<UploadGrant>
  /** @returns whether storage accepted the file. */
  put(url: string, headers: Record<string, string>, file: PreparedPhoto): Promise<boolean>
}

/** A photo did not reach storage. Nothing was charged; sending again uploads afresh. */
export class PhotoUploadError extends Error {
  constructor() {
    super('Photo upload failed')
    this.name = 'PhotoUploadError'
  }
}

/** @returns upload ids, in the order of `photos`. */
export async function uploadPhotos(deps: UploadDeps, photos: PickedPhoto[]): Promise<string[]> {
  if (photos.length === 0) return []

  const prepared = await Promise.all(photos.map((photo) => deps.prepare(photo)))
  const grant = await deps.requestUploads({
    files: prepared.map((file) => ({ content_type: file.contentType, size_bytes: file.size })),
  })

  const results = await Promise.all(
    grant.uploads.map((upload, i) => deps.put(upload.url, upload.headers, prepared[i])),
  )
  if (results.some((ok) => !ok)) throw new PhotoUploadError()

  return grant.uploads.map((upload) => upload.upload_id)
}
