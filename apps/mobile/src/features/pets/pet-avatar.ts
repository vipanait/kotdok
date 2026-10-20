import type { AvatarGrant, AvatarGrantRequest, Pet } from '@lapka/contracts'
import type { PickedPhoto, PreparedPhoto } from '@/features/checks/photos'

/**
 * The pet's photo from the phone (FB-4): made small, written straight to
 * storage through the signed URL the server hands out, then named back to
 * the server, which checks it and makes it the pet's photo.
 */

/** A card shows the photo at 64 points; 1024 keeps it sharp on any screen. */
export const AVATAR_LONG_SIDE = 1024
export const AVATAR_QUALITY = 0.8

export class AvatarUploadError extends Error {}

export type AvatarDeps = {
  prepare: (photo: PickedPhoto) => Promise<PreparedPhoto>
  requestAvatar: (petId: string, body: AvatarGrantRequest) => Promise<AvatarGrant>
  put: (url: string, headers: Record<string, string>, file: PreparedPhoto) => Promise<boolean>
  confirmAvatar: (petId: string, path: string) => Promise<Pet>
}

export async function uploadAvatar(deps: AvatarDeps, petId: string, photo: PickedPhoto): Promise<Pet> {
  const file = await deps.prepare(photo)
  const grant = await deps.requestAvatar(petId, { content_type: file.contentType, size_bytes: file.size })
  if (!(await deps.put(grant.url, grant.headers, file))) throw new AvatarUploadError('upload failed')
  return deps.confirmAvatar(petId, grant.path)
}

export function avatarTarget(photo: PickedPhoto): { width: number } | { height: number } | null {
  if (Math.max(photo.width, photo.height) <= AVATAR_LONG_SIDE) return null
  return photo.width >= photo.height ? { width: AVATAR_LONG_SIDE } : { height: AVATAR_LONG_SIDE }
}
