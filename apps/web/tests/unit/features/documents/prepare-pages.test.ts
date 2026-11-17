import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOCUMENT_LIMITS } from '@lapka/contracts'
import { addPages, focusAfterMove, movePage, PageFileError, pickMethods, preparePages, removePage, type PreparedPage } from '@/features/documents/prepare-pages'

/**
 * The browser's image machinery, recorded: what was decoded, the canvas the
 * page was drawn on, what was painted first and how it was encoded.
 */
type Canvas = { width: number; height: number; painted: string[]; encoded: { type: string; quality: number } | null }

let canvases: Canvas[]
let sizes: Map<string, { width: number; height: number } | 'broken'>

beforeEach(() => {
  canvases = []
  sizes = new Map()
  vi.stubGlobal('createImageBitmap', async (file: File) => {
    const size = sizes.get(file.name)
    if (!size || size === 'broken') throw new Error('cannot decode')
    return { ...size, close: () => {} }
  })
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`unexpected ${tag}`)
      const canvas: Canvas & Record<string, unknown> = { width: 0, height: 0, painted: [], encoded: null }
      canvas.getContext = () => ({
        set fillStyle(value: string) {
          canvas.painted.push(`fill ${value}`)
        },
        fillRect: () => canvas.painted.push('rect'),
        drawImage: (_image: unknown, _x: number, _y: number, w: number, h: number) => canvas.painted.push(`image ${w}x${h}`),
      })
      canvas.toBlob = (done: (blob: Blob) => void, type: string, quality: number) => {
        canvas.encoded = { type, quality }
        done(new Blob(['j'.repeat(100)], { type }))
      }
      canvases.push(canvas)
      return canvas
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function image(name: string, width: number, height: number, type = 'image/jpeg', bytes = 1000): File {
  sizes.set(name, { width, height })
  return new File(['x'.repeat(bytes)], name, { type })
}

function pdf(name = 'passport.pdf', bytes = 5000): File {
  return new File(['%PDF'.padEnd(bytes, '-')], name, { type: 'application/pdf' })
}

describe('preparePages', () => {
  it('shrinks a picture wider than 2000 to a long side of 2000, a JPEG of quality 0.8 on white', async () => {
    const {
      pages: [page],
    } = await preparePages([image('page.png', 4000, 3000, 'image/png')])

    expect(canvases).toHaveLength(1)
    expect(canvases[0]).toMatchObject({ width: 2000, height: 1500 })
    expect(canvases[0].painted).toEqual(['fill #FFFFFF', 'rect', 'image 2000x1500'])
    expect(canvases[0].encoded).toEqual({ type: 'image/jpeg', quality: DOCUMENT_LIMITS.clientQuality })
    expect(page.contentType).toBe('image/jpeg')
    expect(page.blob.type).toBe('image/jpeg')
  })

  it('takes the long side of a tall picture', async () => {
    await preparePages([image('tall.jpg', 3000, 6000)])
    expect(canvases[0]).toMatchObject({ width: 1000, height: 2000 })
  })

  it('sends a small picture of a stored type as it is', async () => {
    const file = image('small.webp', 1200, 900, 'image/webp')
    const { pages: [page] } = await preparePages([file])
    expect(canvases).toHaveLength(0)
    expect(page.blob).toBe(file)
    expect(page.contentType).toBe('image/webp')
  })

  it('re-encodes a small picture of a type the server does not store (HEIC) as JPEG', async () => {
    const { pages: [page] } = await preparePages([image('photo.heic', 1000, 800, 'image/heic')])
    expect(canvases[0]).toMatchObject({ width: 1000, height: 800 })
    expect(page.contentType).toBe('image/jpeg')
  })

  it('passes a PDF unchanged', async () => {
    const file = pdf()
    const { pages: [page] } = await preparePages([file])
    expect(canvases).toHaveLength(0)
    expect(page).toEqual({ blob: file, contentType: 'application/pdf', name: 'passport.pdf' })
  })

  it('does not add a ninth picture', async () => {
    const files = Array.from({ length: 9 }, (_, i) => image(`p${i + 1}.jpg`, 800, 600))
    const { pages, overflow } = await preparePages(files)
    expect(pages.map((page) => page.name)).toEqual(['p1.jpg', 'p2.jpg', 'p3.jpg', 'p4.jpg', 'p5.jpg', 'p6.jpg', 'p7.jpg', 'p8.jpg'])
    expect(overflow).toBe(true)
  })

  it('counts the room left by the pages already chosen', async () => {
    const { pages } = await preparePages([image('a.jpg', 800, 600), image('b.jpg', 800, 600)], 1)
    expect(pages.map((page) => page.name)).toEqual(['a.jpg'])
  })

  it('keeps the good files and names each one that cannot be a page', async () => {
    sizes.set('broken.heic', 'broken')
    const result = await preparePages([
      image('a.jpg', 800, 600),
      new File(['x'], 'broken.heic', { type: 'image/heic' }),
      pdf('big.pdf', DOCUMENT_LIMITS.pdfMaxBytes + 1),
      new File(['x'], 'notes.txt', { type: 'text/plain' }),
      image('b.jpg', 800, 600),
    ])
    expect(result.pages.map((page) => page.name)).toEqual(['a.jpg', 'b.jpg'])
    expect(result.problems.every((problem) => problem instanceof PageFileError)).toBe(true)
    expect(result.problems.map((problem) => [problem.fileName, problem.reason])).toEqual([
      ['broken.heic', 'unreadable'],
      ['big.pdf', 'pdf_too_large'],
      ['notes.txt', 'unsupported'],
    ])
    expect(result.overflow).toBe(false)
  })

  it('does not count a picture it could not read against the room', async () => {
    sizes.set('broken.jpg', 'broken')
    const { pages } = await preparePages([new File(['x'], 'broken.jpg', { type: 'image/jpeg' }), image('a.jpg', 800, 600)], 1)
    expect(pages.map((page) => page.name)).toEqual(['a.jpg'])
  })
})

function page(name: string, contentType: PreparedPage['contentType'] = 'image/jpeg'): PreparedPage {
  return { blob: new Blob(['x'], { type: contentType }), contentType, name }
}

describe('addPages', () => {
  it('appends pictures up to eight and says when some did not fit', () => {
    const current = Array.from({ length: 7 }, (_, i) => page(`p${i}`))
    const result = addPages(current, [page('a'), page('b')])
    expect(result.pages).toHaveLength(8)
    expect(result.pages[7].name).toBe('a')
    expect(result.dropped).toBe('limit')
  })

  it('keeps a PDF alone: it replaces the pictures, and pictures replace it', () => {
    const withPdf = addPages([page('p1'), page('p2')], [page('doc.pdf', 'application/pdf')])
    expect(withPdf.pages.map((p) => p.name)).toEqual(['doc.pdf'])
    expect(withPdf.dropped).toBe('pdf_alone')

    const back = addPages(withPdf.pages, [page('p3')])
    expect(back.pages.map((p) => p.name)).toEqual(['p3'])
    expect(back.dropped).toBe('pdf_alone')
  })

  it('takes the first PDF of several, without the pictures beside it', () => {
    const result = addPages([], [page('a'), page('one.pdf', 'application/pdf'), page('two.pdf', 'application/pdf')])
    expect(result.pages.map((p) => p.name)).toEqual(['one.pdf'])
    expect(result.dropped).toBe('pdf_alone')
  })

  it('adds without a word when everything fits', () => {
    expect(addPages([], [page('a')]).dropped).toBeNull()
    expect(addPages([], [page('doc.pdf', 'application/pdf')]).dropped).toBeNull()
  })
})

describe('movePage', () => {
  it('moves a page up or down and stays within the list', () => {
    const pages = [page('a'), page('b'), page('c')]
    expect(movePage(pages, 2, -1).map((p) => p.name)).toEqual(['a', 'c', 'b'])
    expect(movePage(pages, 0, 1).map((p) => p.name)).toEqual(['b', 'a', 'c'])
    expect(movePage(pages, 0, -1)).toBe(pages)
    expect(movePage(pages, 2, 1)).toBe(pages)
  })
})

describe('removePage', () => {
  it('takes one page out and keeps the order of the others, so they are sent and numbered by place', () => {
    const pages = [page('a'), page('b'), page('c')]
    expect(removePage(pages, 1).map((p) => p.name)).toEqual(['a', 'c'])
    expect(removePage(removePage(removePage(pages, 0), 0), 0)).toEqual([])
    expect(removePage(pages, 3)).toBe(pages)
  })
})

describe('focusAfterMove', () => {
  it('keeps focus on the same action of the moved page while it can still move that way', () => {
    expect(focusAfterMove(2, -1, 3)).toEqual({ index: 1, action: 'up' })
    expect(focusAfterMove(0, 1, 3)).toEqual({ index: 1, action: 'down' })
  })

  it('turns to the other action once the page reaches an end', () => {
    expect(focusAfterMove(1, -1, 3)).toEqual({ index: 0, action: 'down' })
    expect(focusAfterMove(1, 1, 3)).toEqual({ index: 2, action: 'up' })
  })
})

describe('pickMethods', () => {
  it('offers photos and a PDF before anything is chosen', () => {
    expect(pickMethods([])).toEqual({ photos: true, pdf: true, block: null })
  })

  it('offers only more photos beside photos, and nothing at eight', () => {
    expect(pickMethods([page('a'), page('b')])).toEqual({ photos: true, pdf: false, block: 'photos_chosen' })
    const eight = Array.from({ length: DOCUMENT_LIMITS.maxImages }, (_, i) => page(`p${i}`))
    expect(pickMethods(eight)).toEqual({ photos: false, pdf: false, block: 'photos_full' })
  })

  it('offers nothing beside a PDF: it is the whole document', () => {
    expect(pickMethods([page('doc.pdf', 'application/pdf')])).toEqual({ photos: false, pdf: false, block: 'pdf_chosen' })
  })
})
