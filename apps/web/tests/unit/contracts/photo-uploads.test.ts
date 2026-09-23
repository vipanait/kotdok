import { describe, expect, it } from 'vitest'
import {
  CheckCreateInputSchema,
  PHOTO_LIMITS,
  UploadRequestSchema,
  buildOpenApiDocument,
} from '@lapka/contracts'

const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`
const check = (upload_ids: string[]) =>
  CheckCreateInputSchema.safeParse({ symptoms: 'вялый второй день', upload_ids })
const file = (overrides: Record<string, unknown> = {}) => ({
  content_type: 'image/jpeg',
  size_bytes: 400_000,
  ...overrides,
})

describe('photo limits in the contract', () => {
  it('allows up to three photos on a check', () => {
    expect(check([ID(1), ID(2), ID(3)]).success).toBe(true)
    expect(check([ID(1), ID(2), ID(3), ID(4)]).success).toBe(false)
  })

  it('refuses the same upload twice in one check', () => {
    expect(check([ID(1), ID(1)]).success).toBe(false)
  })

  it('asks for at most three files per upload request', () => {
    expect(UploadRequestSchema.safeParse({ files: [file(), file(), file()] }).success).toBe(true)
    expect(UploadRequestSchema.safeParse({ files: [file(), file(), file(), file()] }).success).toBe(false)
  })

  it('refuses a file over the size limit before handing out a grant', () => {
    expect(UploadRequestSchema.safeParse({ files: [file({ size_bytes: PHOTO_LIMITS.maxBytes })] }).success).toBe(true)
    expect(UploadRequestSchema.safeParse({ files: [file({ size_bytes: PHOTO_LIMITS.maxBytes + 1 })] }).success).toBe(false)
  })

  it('does not accept HEIC: the phone converts it, the server cannot read it', () => {
    expect(UploadRequestSchema.safeParse({ files: [file({ content_type: 'image/heic' })] }).success).toBe(false)
  })
})

describe('POST /uploads in the published document', () => {
  it('declares the 503 the route answers when Storage is down', () => {
    const document = buildOpenApiDocument() as {
      paths: Record<string, { post: { responses: Record<string, unknown> } }>
    }
    expect(Object.keys(document.paths['/uploads'].post.responses)).toContain('503')
  })
})
