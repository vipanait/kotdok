import { describe, expect, it } from 'vitest'
import { AvatarUploadError, avatarTarget, uploadAvatar, type AvatarDeps } from './pet-avatar'

const prepared = { uri: 'file:///a.jpg', size: 1234, contentType: 'image/jpeg' as const }
const grant = { path: 'u/p/x', url: 'https://storage/x', method: 'PUT' as const, headers: { 'content-type': 'image/jpeg' }, expires_at: '2026-10-20T12:00:00.000Z' }

function deps(overrides: Partial<AvatarDeps> = {}) {
  const calls: string[] = []
  const all: AvatarDeps = {
    prepare: async () => (calls.push('prepare'), prepared),
    requestAvatar: async (_id, body) => (calls.push(`grant:${body.size_bytes}`), grant),
    put: async () => (calls.push('put'), true),
    confirmAvatar: async (_id, path) => (calls.push(`confirm:${path}`), { id: 'p' } as never),
    ...overrides,
  }
  return { calls, all }
}

describe('the pet’s photo from the phone (FB-4)', () => {
  it('prepares, asks for a grant, writes the file and confirms its path', async () => {
    const { calls, all } = deps()
    await uploadAvatar(all, 'p', { uri: 'file:///raw.heic', width: 4000, height: 3000 })
    expect(calls).toEqual(['prepare', 'grant:1234', 'put', 'confirm:u/p/x'])
  })

  it('does not confirm a file storage refused', async () => {
    const { calls, all } = deps({ put: async () => false })
    await expect(uploadAvatar(all, 'p', { uri: 'x', width: 1, height: 1 })).rejects.toBeInstanceOf(AvatarUploadError)
    expect(calls.some((call) => call.startsWith('confirm'))).toBe(false)
  })

  it('shrinks to 1024 on the long side, and leaves a small one as it is', () => {
    expect(avatarTarget({ uri: 'x', width: 4000, height: 3000 })).toEqual({ width: 1024 })
    expect(avatarTarget({ uri: 'x', width: 3000, height: 4000 })).toEqual({ height: 1024 })
    expect(avatarTarget({ uri: 'x', width: 800, height: 600 })).toBeNull()
  })
})
