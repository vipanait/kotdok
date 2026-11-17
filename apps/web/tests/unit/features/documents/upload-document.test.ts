import { describe, expect, it, vi } from 'vitest'
import type { DocumentCreateInput } from '@lapka/contracts'
import { ApiError, ApiTimeoutError } from '@lapka/shared'
import type { PreparedPage } from '@/features/documents/prepare-pages'
import { PageUploadError, putFile, uploadDocument, uploadFailure, type UploadDeps, type UploadProgress } from '@/features/documents/upload-document'

const PET = '11111111-1111-4111-8111-000000000001'
const DOC = '22222222-2222-4222-8222-000000000002'

function page(name: string, bytes: number, contentType: PreparedPage['contentType'] = 'image/jpeg'): PreparedPage {
  return { blob: new Blob(['x'.repeat(bytes)], { type: contentType }), contentType, name }
}

function fakeApi(putOk = true, overrides: Partial<UploadDeps> = {}) {
  const calls: string[] = []
  const api: UploadDeps = {
    createDocument: vi.fn(async (_pet: string, input: DocumentCreateInput) => {
      calls.push(`create ${input.kind}${input.title ? ` «${input.title}»` : ''} ${input.files.map((f) => `${f.content_type}:${f.size_bytes}`).join(',')}`)
      return {
        document_id: DOC,
        uploads: input.files.map((_, i) => ({
          file_id: `33333333-3333-4333-8333-00000000000${i}`,
          url: `https://storage.example/${i}`,
          method: 'PUT' as const,
          headers: { 'content-type': input.files[i].content_type },
          expires_at: '2026-11-16T12:00:00.000Z',
        })),
      }
    }),
    put: vi.fn(async (url: string, _headers: Record<string, string>, body: Blob) => {
      calls.push(`put ${url} ${body.size}`)
      return putOk
    }),
    completeDocument: vi.fn(async (_pet: string, docId: string) => {
      calls.push(`complete ${docId}`)
      return { id: docId, status: 'stored' } as never
    }),
    getDocument: vi.fn(async (_pet: string, docId: string) => {
      calls.push(`read ${docId}`)
      return { id: docId, status: 'stored' } as never
    }),
    ...overrides,
  }
  return { api, calls }
}

describe('uploadDocument', () => {
  it('asks for the upload, puts each page in order, then completes', async () => {
    const { api, calls } = fakeApi()
    const progress: UploadProgress[] = []
    await uploadDocument(api, PET, { kind: 'vet_passport' }, [page('a', 3), page('b', 5)], (p) => progress.push(p))
    expect(calls).toEqual([
      'create vet_passport image/jpeg:3,image/jpeg:5',
      'put https://storage.example/0 3',
      'put https://storage.example/1 5',
      `complete ${DOC}`,
    ])
    expect(progress).toEqual([{ step: 'start' }, { step: 'page', n: 1, total: 2 }, { step: 'page', n: 2, total: 2 }, { step: 'check' }])
  })

  it('sends the name given, trimmed, and none for a blank one', async () => {
    const named = fakeApi()
    await uploadDocument(named.api, PET, { kind: 'lab_results', title: '  Анализ крови ' }, [page('a', 3)])
    expect(named.calls[0]).toBe('create lab_results «Анализ крови» image/jpeg:3')
    const blank = fakeApi()
    await uploadDocument(blank.api, PET, { kind: 'other', title: '   ' }, [page('a', 3)])
    expect(blank.calls[0]).toBe('create other image/jpeg:3')
  })

  it('stops without completing when a page does not reach storage', async () => {
    const { api, calls } = fakeApi(false)
    await expect(uploadDocument(api, PET, { kind: 'other' }, [page('a', 3), page('b', 5)])).rejects.toBeInstanceOf(PageUploadError)
    expect(calls).toHaveLength(2)
  })

  it('reads the document again after a complete with no answer, and takes it when stored', async () => {
    const { api, calls } = fakeApi(true, {
      completeDocument: vi.fn(async () => {
        throw new ApiTimeoutError('/complete', 30000)
      }),
    })
    await expect(uploadDocument(api, PET, { kind: 'other' }, [page('a', 3)])).resolves.toMatchObject({ id: DOC, status: 'stored' })
    expect(calls.at(-1)).toBe(`read ${DOC}`)
  })

  it('says the failure when the document is still pending, or cannot be read either', async () => {
    const lost = new TypeError('Failed to fetch')
    const failing = { completeDocument: vi.fn(async () => { throw lost }) }
    const pending = fakeApi(true, { ...failing, getDocument: vi.fn(async () => ({ id: DOC, status: 'pending' }) as never) })
    await expect(uploadDocument(pending.api, PET, { kind: 'other' }, [page('a', 3)])).rejects.toBe(lost)
    const unread = fakeApi(true, { ...failing, getDocument: vi.fn(async () => { throw new TypeError('offline') }) })
    await expect(uploadDocument(unread.api, PET, { kind: 'other' }, [page('a', 3)])).rejects.toBe(lost)
  })

  it('does not read again after a refusal: the server answered', async () => {
    const refusal = new ApiError('bad_request', 400, 'x', null, { reason: 'encrypted' })
    const { api, calls } = fakeApi(true, { completeDocument: vi.fn(async () => { throw refusal }) })
    await expect(uploadDocument(api, PET, { kind: 'other' }, [page('a', 3)])).rejects.toBe(refusal)
    expect(calls.some((call) => call.startsWith('read'))).toBe(false)
  })
})

describe('uploadFailure', () => {
  const refused = (reason?: string) => new ApiError('bad_request', 400, 'The file was refused', null, reason ? { reason } : undefined)

  it('names each file the server refuses', () => {
    expect(uploadFailure(refused('too_many_pages'))).toBe('too_many_pages')
    expect(uploadFailure(refused('encrypted'))).toBe('encrypted')
    expect(uploadFailure(refused('unsupported_media_type'))).toBe('unsupported_media_type')
    expect(uploadFailure(refused('payload_too_large'))).toBe('payload_too_large')
    expect(uploadFailure(refused())).toBe('refused')
  })

  it('reads the limit of documents, the hourly limit, the connection and the session', () => {
    expect(uploadFailure(new ApiError('conflict', 409, 'x', null, { reason: 'limit_reached' }))).toBe('limit_reached')
    expect(uploadFailure(new ApiError('conflict', 409, 'x', null, { reason: 'wrong_status' }))).toBe('failed')
    expect(uploadFailure(new ApiError('rate_limited', 429, 'x'))).toBe('rateLimited')
    expect(uploadFailure(new TypeError('Failed to fetch'))).toBe('offline')
    expect(uploadFailure(new ApiTimeoutError('/pets', 30000))).toBe('offline')
    expect(uploadFailure(new ApiError('unauthorized', 401, 'x'))).toBe('signedOut')
    expect(uploadFailure(new ApiError('not_found', 404, 'x'))).toBe('gone')
    expect(uploadFailure(new PageUploadError())).toBe('upload')
    expect(uploadFailure(new ApiError('internal_error', 500, 'x'))).toBe('failed')
  })
})

describe('putFile', () => {
  it('gives up on a PUT that never answers', async () => {
    vi.stubGlobal('fetch', (_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    )
    try {
      await expect(putFile('https://storage.example/put', {}, new Blob(['x']), 20)).resolves.toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('says whether storage took the file', async () => {
    vi.stubGlobal('fetch', async (_url: string, init: { method: string; credentials: string }) => ({ ok: init.method === 'PUT' && init.credentials === 'omit' }))
    try {
      await expect(putFile('https://storage.example/put', { 'content-type': 'image/jpeg' }, new Blob(['x']))).resolves.toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
