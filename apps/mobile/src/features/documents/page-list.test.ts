import { describe, expect, it } from 'vitest'
import { ru } from '@/i18n/ru'
import {
  NO_PAGES,
  addMoreMethods,
  addPages,
  checkPdf,
  documentPageTarget,
  draftChanged,
  movePage,
  numberPages,
  pageCaption,
  photoRoom,
  pickMethods,
  removePage,
  type PickedPage,
} from './page-list'

const photo = (name: string | null, source: 'camera' | 'library' = 'library'): PickedPage => ({
  uri: `file:///${name ?? 'cam'}.jpg`,
  contentType: 'image/jpeg',
  size: 1000,
  name,
  source,
})
const pdf: PickedPage = { uri: 'file:///a.pdf', contentType: 'application/pdf', size: 2000, name: 'Анализы.pdf', source: 'pdf' }

describe('numbering picked pages', () => {
  it('gives each page a stable key and its source’s own count, across picks', () => {
    const first = numberPages([photo(null, 'camera'), photo('IMG_1.jpg')], NO_PAGES)
    const second = numberPages([photo(null, 'camera')], first.counters)
    expect(first.pages.map((p) => [p.key, p.ordinal])).toEqual([
      ['page-1', 1],
      ['page-2', 1],
    ])
    expect(second.pages.map((p) => [p.key, p.ordinal])).toEqual([['page-3', 2]])
  })

  it('names a camera photo by its number, a library photo by its file name', () => {
    const { pages } = numberPages([photo(null, 'camera'), photo(null, 'camera'), photo('IMG_7.HEIC'), photo(null)], NO_PAGES)
    expect(pages.map((p) => pageCaption(ru, p))).toEqual(['Фото с камеры 1', 'Фото с камеры 2', 'IMG_7.HEIC', 'Фото из галереи 2'])
    expect(pageCaption(ru, { ...pdf, ordinal: 1 })).toBe('Анализы.pdf')
  })

  it('keeps a camera photo’s name when it is moved', () => {
    const { pages } = numberPages([photo(null, 'camera'), photo(null, 'camera')], NO_PAGES)
    expect(movePage(pages, 1, -1).map((p) => pageCaption(ru, p))).toEqual(['Фото с камеры 2', 'Фото с камеры 1'])
  })
})

describe('adding pages', () => {
  it('appends photos up to eight and says the rest were left out', () => {
    const seven = Array.from({ length: 7 }, (_, i) => photo(`${i}.jpg`))
    const { pages, dropped } = addPages(seven, [photo('a.jpg'), photo('b.jpg')])
    expect(pages).toHaveLength(8)
    expect(pages[7].name).toBe('a.jpg')
    expect(dropped).toBe('limit')
  })

  it('lets a PDF stand alone, replacing photos, and photos replace it', () => {
    expect(addPages([photo('a.jpg')], [pdf])).toEqual({ pages: [pdf], dropped: 'pdf_alone' })
    expect(addPages([], [pdf])).toEqual({ pages: [pdf], dropped: null })
    expect(addPages([pdf], [photo('b.jpg')])).toEqual({ pages: [photo('b.jpg')], dropped: 'pdf_alone' })
  })

  it('counts the room for photos, all eight beside a PDF that will be replaced', () => {
    expect(photoRoom([])).toBe(8)
    expect(photoRoom([photo('a.jpg'), photo('b.jpg')])).toBe(6)
    expect(photoRoom([pdf])).toBe(8)
  })
})

describe('reordering and removing', () => {
  const pages = ['a', 'b', 'c']

  it('moves a page one place, and leaves the list at its ends', () => {
    expect(movePage(pages, 0, 1)).toEqual(['b', 'a', 'c'])
    expect(movePage(pages, 2, -1)).toEqual(['a', 'c', 'b'])
    expect(movePage(pages, 0, -1)).toEqual(pages)
    expect(movePage(pages, 2, 1)).toEqual(pages)
  })

  it('removes a page and keeps the order of the rest, down to none', () => {
    expect(removePage(pages, 1)).toEqual(['a', 'c'])
    expect(removePage(removePage(removePage(pages, 0), 0), 0)).toEqual([])
    expect(removePage(pages, 5)).toEqual(pages)
  })
})

describe('leaving the draft', () => {
  it('counts a page or a typed name as something to lose, not whitespace', () => {
    expect(draftChanged([], '')).toBe(false)
    expect(draftChanged([], '   ')).toBe(false)
    expect(draftChanged([], 'Паспорт')).toBe(true)
    expect(draftChanged([photo('a.jpg')], '')).toBe(true)
  })
})

describe('preparing and checking files', () => {
  it('makes a photo’s long side at most 2000, and leaves a small one alone', () => {
    expect(documentPageTarget({ uri: 'x', width: 4032, height: 3024 })).toEqual({ width: 2000 })
    expect(documentPageTarget({ uri: 'x', width: 3024, height: 4032 })).toEqual({ height: 2000 })
    expect(documentPageTarget({ uri: 'x', width: 1600, height: 1200 })).toBeNull()
  })

  it('takes a PDF within 10 MB and says why another file is not one', () => {
    expect(checkPdf({ name: 'a.pdf', size: 1000, mimeType: 'application/pdf' })).toBeNull()
    expect(checkPdf({ name: 'a.PDF', size: null, mimeType: null })).toBeNull()
    expect(checkPdf({ name: 'a.pdf', size: 11 * 1024 * 1024, mimeType: 'application/pdf' })).toBe('pdf_too_large')
    expect(checkPdf({ name: 'a.docx', size: 10, mimeType: 'application/msword' })).toBe('unsupported')
  })
})

describe('ways to add pages', () => {
  it('offers the PDF picker only when the app has it', () => {
    expect(pickMethods(true)).toEqual(['camera', 'library', 'pdf'])
    expect(pickMethods(false)).toEqual(['camera', 'library'])
  })

  it('drops the photo buttons at eight photos, and keeps them beside a PDF', () => {
    const eight = Array.from({ length: 8 }, (_, i) => photo(`${i}.jpg`))
    expect(addMoreMethods(eight, true)).toEqual(['pdf'])
    expect(addMoreMethods(eight, false)).toEqual([])
    expect(addMoreMethods([pdf], true)).toEqual(['camera', 'library', 'pdf'])
  })
})
