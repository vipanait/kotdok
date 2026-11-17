import { describe, expect, it, vi } from 'vitest'
import { DOCUMENT_PICKER_MODULE, firstAsset, pdfPickerFrom } from './pdf-picker'

describe('the PDF picker', () => {
  it('is not there when the app has no native module, or asking for it throws', () => {
    expect(pdfPickerFrom(() => null)).toBeNull()
    expect(pdfPickerFrom(() => undefined)).toBeNull()
    expect(pdfPickerFrom(() => ({}))).toBeNull()
    expect(
      pdfPickerFrom(() => {
        throw new Error('Cannot find native module')
      }),
    ).toBeNull()
  })

  it('asks the native module by its name, for one PDF copied where the app can read it', async () => {
    const getDocumentAsync = vi.fn(async () => ({
      canceled: false,
      assets: [{ uri: 'file:///cache/a.pdf', name: 'Анализы.pdf', size: 2048, mimeType: 'application/pdf' }],
    }))
    const load = vi.fn(() => ({ getDocumentAsync }))
    const picker = pdfPickerFrom(load)
    expect(load).toHaveBeenCalledWith(DOCUMENT_PICKER_MODULE)
    expect(await picker?.pick()).toEqual({ uri: 'file:///cache/a.pdf', name: 'Анализы.pdf', size: 2048, mimeType: 'application/pdf' })
    expect(getDocumentAsync).toHaveBeenCalledWith(expect.objectContaining({ type: ['application/pdf'], copyToCacheDirectory: true, multiple: false }))
  })

  it('reads a closed picker or an odd answer as nothing chosen', () => {
    expect(firstAsset({ canceled: true, assets: null })).toBeNull()
    expect(firstAsset({ canceled: false, assets: [] })).toBeNull()
    expect(firstAsset(null)).toBeNull()
    expect(firstAsset({ canceled: false, assets: [{ name: 'no uri' }] })).toBeNull()
  })

  it('names a file without a name by its path, and leaves unknown size and type unknown', () => {
    expect(firstAsset({ canceled: false, assets: [{ uri: 'file:///cache/x/scan.pdf' }] })).toEqual({
      uri: 'file:///cache/x/scan.pdf',
      name: 'scan.pdf',
      size: null,
      mimeType: null,
    })
  })
})
