import { describe, expect, it } from 'vitest'
import { avatarCacheKey } from './avatar-cache-key'

describe('a pet photo cached by its file, not by its link (PR #82 review)', () => {
  it('keeps one key across fresh signatures, and a new one for a new photo', () => {
    const base = 'https://x.supabase.co/storage/v1/object/sign/pet-avatars/u/p/aaa'
    expect(avatarCacheKey(`${base}?token=one`)).toBe(base)
    expect(avatarCacheKey(`${base}?token=two`)).toBe(base)
    expect(avatarCacheKey(`${base.replace('aaa', 'bbb')}?token=one`)).not.toBe(base)
  })
})
