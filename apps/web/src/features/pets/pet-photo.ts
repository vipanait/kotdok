import type { AvatarGrant, AvatarGrantRequest } from '@lapka/contracts'

/**
 * The pet's photo from the site (FB-4), by the phone's way: the file goes
 * straight to storage through the signed URL the server hands out, then its
 * path is named back and the server checks it is a picture of this pet's.
 * A signed link is never kept: the pet is read again for a fresh one.
 */

export type AvatarContentType = AvatarGrantRequest['content_type']

/** What the API stores (`AvatarGrantRequestSchema`). */
export const AVATAR_TYPES: readonly AvatarContentType[] = ['image/jpeg', 'image/png', 'image/webp']

/** A card shows the photo at up to 100px; 1024 keeps it sharp and well under the 5 MB limit. */
export const AVATAR_LONG_SIDE = 1024

export type PreparedPhoto = { blob: Blob; contentType: AvatarContentType }

/** What «Сохранить» does with the photo: nothing, a new one, or none. */
export type PhotoChange = { kind: 'keep' } | { kind: 'set'; photo: PreparedPhoto } | { kind: 'remove' }

export type PhotoDeps = {
  requestAvatar: (petId: string, body: AvatarGrantRequest) => Promise<AvatarGrant>
  put: (url: string, headers: Record<string, string>, body: Blob) => Promise<boolean>
  confirmAvatar: (petId: string, path: string) => Promise<unknown>
  removeAvatar: (petId: string) => Promise<unknown>
}

export class AvatarUploadError extends Error {}

/** A file the API would refuse, said before anything is sent. */
export function photoProblem(file: { type: string }): 'type' | null {
  return (AVATAR_TYPES as readonly string[]).includes(file.type) ? null : 'type'
}

export async function applyPhoto(deps: PhotoDeps, petId: string, change: PhotoChange): Promise<void> {
  if (change.kind === 'keep') return
  if (change.kind === 'remove') {
    await deps.removeAvatar(petId)
    return
  }
  const { blob, contentType } = change.photo
  const grant = await deps.requestAvatar(petId, { content_type: contentType, size_bytes: blob.size })
  if (!(await deps.put(grant.url, grant.headers, blob))) throw new AvatarUploadError('upload failed')
  await deps.confirmAvatar(petId, grant.path)
}
