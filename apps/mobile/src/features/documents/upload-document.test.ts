import { describe, expect, it, vi } from 'vitest'
import type { DocumentGrant, PetDocument } from '@lapka/contracts'
import { ApiError, type ApiErrorCode } from '@lapka/shared'
import { ru } from '@/i18n/ru'
import type { PickedPage } from './page-list'
import { PageUploadError, uploadDocument, uploadFailure, uploadMessage, type UploadDeps, type UploadProgress } from './upload-document'

const PET = '11111111-1111-4111-8111-000000000001'
const DOC = '22222222-2222-4222-8222-000000000002'

const pages: PickedPage[] = [
  { uri: 'file:///1.jpg', contentType: 'image/jpeg', size: 100, name: null, source: 'camera' },
  { uri: 'file:///2.jpg', contentType: 'image/jpeg', size: 200, name: 'IMG_2.jpg', source: 'library' },
]

const grant: DocumentGrant = {
  document_id: DOC,
  uploads: pages.map((_, i) => ({
    file_id: `33333333-3333-4333-8333-00000000000${i}`,
    url: `https://storage/put/${i}`,
    method: 'PUT' as const,
    headers: { 'content-type': 'image/jpeg' },
    expires_at: '2026-11-17T10:15:00.000Z',
  })),
}

const stored = { id: DOC, status: 'stored' } as PetDocument

function deps(overrides: Partial<UploadDeps> = {}) {
  const calls: string[] = []
  const api: UploadDeps = {
    createDocument: vi.fn(async (_pet, body) => {
      calls.push(`create ${body.files.map((f: { size_bytes: number }) => f.size_bytes).join(',')}`)
      return grant
    }),
    put: vi.fn(async (url: string, _headers: Record<string, string>, page: PickedPage) => {
      calls.push(`put ${url} ${page.uri}`)
      return true
    }),
    completeDocument: vi.fn(async () => {
      calls.push('complete')
      return stored
    }),
    getDocument: vi.fn(async () => {
      calls.push('get')
      return stored
    }),
    ...overrides,
  }
  return { api, calls }
}

const offline = () => new TypeError('Network request failed')

describe('saving a document', () => {
  it('creates, puts each page in the list’s order, then completes', async () => {
    const { api, calls } = deps()
    const progress: UploadProgress[] = []
    expect(await uploadDocument(api, PET, { kind: 'vet_passport', title: '  Паспорт ' }, pages, (p) => progress.push(p))).toBe(stored)
    expect(calls).toEqual(['create 100,200', 'put https://storage/put/0 file:///1.jpg', 'put https://storage/put/1 file:///2.jpg', 'complete'])
    expect(api.createDocument).toHaveBeenCalledWith(PET, {
      kind: 'vet_passport',
      title: 'Паспорт',
      files: [
        { content_type: 'image/jpeg', size_bytes: 100 },
        { content_type: 'image/jpeg', size_bytes: 200 },
      ],
    })
    expect(progress).toEqual([{ step: 'start' }, { step: 'page', n: 1, total: 2 }, { step: 'page', n: 2, total: 2 }, { step: 'check' }])
  })

  it('sends no title when none was typed', async () => {
    const { api } = deps()
    await uploadDocument(api, PET, { kind: 'other', title: '   ' }, pages)
    expect(vi.mocked(api.createDocument).mock.calls[0][1]).not.toHaveProperty('title')
  })

  it('stops at a page that did not reach storage, and never completes', async () => {
    const { api, calls } = deps({ put: vi.fn(async () => false) })
    await expect(uploadDocument(api, PET, { kind: 'other' }, pages)).rejects.toBeInstanceOf(PageUploadError)
    expect(calls).toEqual(['create 100,200'])
    expect(api.completeDocument).not.toHaveBeenCalled()
  })

  it('reads the document again after a complete with no answer, and takes it when it was stored', async () => {
    const { api, calls } = deps({
      completeDocument: vi.fn(async () => {
        throw offline()
      }),
    })
    expect(await uploadDocument(api, PET, { kind: 'other' }, pages)).toBe(stored)
    expect(calls.at(-1)).toBe('get')
  })

  it('says the failure when the re-read finds it still pending or cannot read it', async () => {
    const failing = vi.fn(async () => {
      throw offline()
    })
    const pending = deps({ completeDocument: failing, getDocument: vi.fn(async () => ({ ...stored, status: 'pending' as const })) })
    await expect(uploadDocument(pending.api, PET, { kind: 'other' }, pages)).rejects.toBeInstanceOf(TypeError)
    const unread = deps({ completeDocument: failing, getDocument: vi.fn(async () => Promise.reject(offline())) })
    await expect(uploadDocument(unread.api, PET, { kind: 'other' }, pages)).rejects.toBeInstanceOf(TypeError)
  })

  it('does not re-read after the server refused the file', async () => {
    const refused = new ApiError('bad_request', 400, 'refused', 'r1', { reason: 'encrypted' })
    const { api } = deps({
      completeDocument: vi.fn(async () => {
        throw refused
      }),
    })
    await expect(uploadDocument(api, PET, { kind: 'other' }, pages)).rejects.toBe(refused)
    expect(api.getDocument).not.toHaveBeenCalled()
  })
})

describe('what a failed save says', () => {
  const api = (status: number, code: ApiErrorCode, reason?: string) => new ApiError(code, status, 'x', 'r1', reason ? { reason } : undefined)

  it('reads a refused file by its reason', () => {
    expect(uploadFailure(api(400, 'bad_request', 'encrypted'))).toBe('encrypted')
    expect(uploadFailure(api(400, 'bad_request', 'too_many_pages'))).toBe('too_many_pages')
    expect(uploadFailure(api(400, 'bad_request', 'something_new'))).toBe('refused')
    expect(uploadFailure(api(409, 'conflict', 'limit_reached'))).toBe('limit_reached')
    expect(uploadFailure(new PageUploadError())).toBe('upload')
    expect(uploadFailure(offline())).toBe('offline')
    expect(uploadFailure(api(500, 'internal_error'))).toBe('failed')
  })

  it('says a refused file as a heading and a line with the contract’s numbers', () => {
    expect(uploadMessage(ru, 'encrypted')).toEqual({
      kind: 'file',
      title: 'PDF защищён паролем',
      body: 'Выберите PDF без пароля или добавьте фотографии страниц.',
    })
    expect(uploadMessage(ru, 'too_many_pages')).toMatchObject({ kind: 'file', title: 'В PDF больше 10 страниц' })
    expect(uploadMessage(ru, 'limit_reached')).toMatchObject({ kind: 'banner', text: expect.stringContaining('30 документов') })
    expect(uploadMessage(ru, 'offline')).toMatchObject({ kind: 'banner', offline: true })
  })
})
