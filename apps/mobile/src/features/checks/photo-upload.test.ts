import { describe, expect, it, vi } from 'vitest'
import type { UploadGrant } from '@lapka/contracts'
import { PhotoUploadError, uploadPhotos, type UploadDeps } from './photo-upload'

const picked = (n: number) => ({ uri: `file:///p${n}.jpg`, width: 4000, height: 3000 })
const grant = (n: number): UploadGrant => ({
  uploads: Array.from({ length: n }, (_, i) => ({
    upload_id: `00000000-0000-4000-8000-00000000000${i + 1}`,
    url: `https://storage.example/upload/${i + 1}`,
    method: 'PUT' as const,
    headers: { 'content-type': 'image/jpeg', 'x-upsert': 'false' },
    expires_at: '2026-09-23T10:15:00Z',
  })),
})

function deps(overrides: Partial<UploadDeps> = {}): UploadDeps {
  return {
    prepare: vi.fn(async (p) => ({
      uri: p.uri.replace('.jpg', '-small.jpg'),
      size: 400_000,
      contentType: 'image/jpeg' as const,
    })),
    requestUploads: vi.fn(async (body) => grant(body.files.length)),
    put: vi.fn(async () => true),
    ...overrides,
  }
}

describe('uploadPhotos', () => {
  it('asks for one grant per photo with the prepared size, and writes each to its own URL', async () => {
    const d = deps()
    const ids = await uploadPhotos(d, [picked(1), picked(2)])

    expect(d.requestUploads).toHaveBeenCalledWith({
      files: [
        { content_type: 'image/jpeg', size_bytes: 400_000 },
        { content_type: 'image/jpeg', size_bytes: 400_000 },
      ],
    })
    expect(vi.mocked(d.put).mock.calls.map(([url, , file]) => [url, file.uri])).toEqual([
      ['https://storage.example/upload/1', 'file:///p1-small.jpg'],
      ['https://storage.example/upload/2', 'file:///p2-small.jpg'],
    ])
    expect(ids).toEqual(['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'])
  })

  it('asks for nothing when there are no photos', async () => {
    const d = deps()
    expect(await uploadPhotos(d, [])).toEqual([])
    expect(d.requestUploads).not.toHaveBeenCalled()
  })

  it('fails as a whole when one file does not get through', async () => {
    const d = deps({ put: vi.fn(async (url: string) => !url.endsWith('/2')) })
    await expect(uploadPhotos(d, [picked(1), picked(2)])).rejects.toBeInstanceOf(PhotoUploadError)
  })
})
