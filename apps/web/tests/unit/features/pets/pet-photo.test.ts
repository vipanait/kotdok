import { describe, expect, it, vi } from 'vitest'
import { applyPhoto, photoProblem, AvatarUploadError, type PhotoDeps } from '@/features/pets/pet-photo'

const PET = '11111111-1111-4111-8111-000000000001'

function deps(overrides: Partial<PhotoDeps> = {}): PhotoDeps & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    requestAvatar: vi.fn(async (_id, body) => {
      calls.push(`grant ${body.content_type} ${body.size_bytes}`)
      return { path: 'u/p/file', url: 'https://storage.example/upload', method: 'PUT' as const, headers: { 'content-type': body.content_type }, expires_at: '2026-10-20T12:00:00.000Z' }
    }),
    put: vi.fn(async (url) => {
      calls.push(`put ${url}`)
      return true
    }),
    confirmAvatar: vi.fn(async (_id, path) => {
      calls.push(`confirm ${path}`)
    }),
    removeAvatar: vi.fn(async () => {
      calls.push('remove')
    }),
    ...overrides,
  }
}

const photo = { blob: new Blob(['x'.repeat(10)], { type: 'image/jpeg' }), contentType: 'image/jpeg' as const }

describe('the pet’s photo after the form is saved', () => {
  it('an untouched photo sends nothing at all', async () => {
    const d = deps()
    await applyPhoto(d, PET, { kind: 'keep' })
    expect(d.calls).toEqual([])
  })

  it('a new photo: a grant for its type and size, the file to storage, then the path named back', async () => {
    const d = deps()
    await applyPhoto(d, PET, { kind: 'set', photo })
    expect(d.calls).toEqual(['grant image/jpeg 10', 'put https://storage.example/upload', 'confirm u/p/file'])
  })

  it('a failed upload is never confirmed, and says so', async () => {
    const d = deps({ put: vi.fn(async () => false) })
    await expect(applyPhoto(d, PET, { kind: 'set', photo })).rejects.toBeInstanceOf(AvatarUploadError)
    expect(d.confirmAvatar).not.toHaveBeenCalled()
  })

  it('«Удалить фото» removes it on the server', async () => {
    const d = deps()
    await applyPhoto(d, PET, { kind: 'remove' })
    expect(d.calls).toEqual(['remove'])
  })
})

describe('which files are taken', () => {
  it('takes the pictures the API stores', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) expect(photoProblem({ type })).toBeNull()
  })

  it('refuses anything else before any upload', () => {
    for (const type of ['image/heic', 'image/gif', 'application/pdf', '']) expect(photoProblem({ type })).toBe('type')
  })
})
