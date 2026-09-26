import { describe, expect, it } from 'vitest'
import { sharePdf, type ShareDeps } from './share-flow'

function deps(overrides: Partial<ShareDeps> = {}) {
  const calls: string[] = []
  const all: ShareDeps = {
    print: async () => (calls.push('print'), 'file:///cache/print-1.pdf'),
    rename: async (_uri, name) => (calls.push(`rename ${name}`), `file:///cache/${name}`),
    share: async (uri) => void calls.push(`share ${uri}`),
    remove: (uri) => void calls.push(`remove ${uri}`),
    sweep: () => void calls.push('sweep'),
    keepAfterShare: false,
    ...overrides,
  }
  return { all, calls }
}

describe('sending the PDF (MR-09.4)', () => {
  it('prints, names, shares and removes the file', async () => {
    const { all, calls } = deps()
    await sharePdf('<html>', 'Мурка — медкарта — 24.09.2026.pdf', all)
    expect(calls).toEqual([
      'sweep',
      'print',
      'rename Мурка — медкарта — 24.09.2026.pdf',
      'share file:///cache/Мурка — медкарта — 24.09.2026.pdf',
      'remove file:///cache/Мурка — медкарта — 24.09.2026.pdf',
    ])
  })

  it('removes the file when sharing fails, and lets the screen retry', async () => {
    const { all, calls } = deps({ share: async () => Promise.reject(new Error('no share')) })
    await expect(sharePdf('<html>', 'a.pdf', all)).rejects.toThrow('no share')
    expect(calls.at(-1)).toBe('remove file:///cache/a.pdf')
  })

  it('removes the printed file when naming fails', async () => {
    const { all, calls } = deps({ rename: async () => Promise.reject(new Error('disk')) })
    await expect(sharePdf('<html>', 'a.pdf', all)).rejects.toThrow('disk')
    expect(calls.at(-1)).toBe('remove file:///cache/print-1.pdf')
  })

  it('fails before anything is written when printing fails', async () => {
    const { all, calls } = deps({ print: async () => Promise.reject(new Error('print')) })
    await expect(sharePdf('<html>', 'a.pdf', all)).rejects.toThrow('print')
    expect(calls).toEqual(['sweep'])
  })

  it('keeps the file after the sheet closes where the receiver may still read it, until the next send', async () => {
    // Android answers as soon as the target opens its own screen; deleting then would take the file from under it.
    const { all, calls } = deps({ keepAfterShare: true })
    await sharePdf('<html>', 'a.pdf', all)
    expect(calls).toEqual(['sweep', 'print', 'rename a.pdf', 'share file:///cache/a.pdf'])
    const failing = deps({ keepAfterShare: true, share: async () => Promise.reject(new Error('no share')) })
    await expect(sharePdf('<html>', 'a.pdf', failing.all)).rejects.toThrow()
    expect(failing.calls.at(-1)).toBe('remove file:///cache/a.pdf')
  })
})
