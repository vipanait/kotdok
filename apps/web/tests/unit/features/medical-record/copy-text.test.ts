import { describe, expect, it, vi } from 'vitest'
import { copyText } from '@/features/medical-record/summary/copy-text'

describe('«Скопировать текст»', () => {
  it('says «скопировано» only once the clipboard took the text', async () => {
    const writeText = vi.fn(async () => undefined)
    expect(await copyText({ writeText }, 'Мурка')).toBe('copied')
    expect(writeText).toHaveBeenCalledWith('Мурка')
  })

  it('a refused clipboard is a failure, never a success', async () => {
    expect(await copyText({ writeText: vi.fn(async () => Promise.reject(new DOMException('denied', 'NotAllowedError'))) }, 'x')).toBe('failed')
  })

  it('a browser with no clipboard API is a failure', async () => {
    expect(await copyText(undefined, 'x')).toBe('failed')
  })
})
