import { describe, expect, it } from 'vitest'
import { addPhotos, resizeTarget } from './photos'

const photo = (n: number, width = 4032, height = 3024) => ({ uri: `file:///p${n}.heic`, width, height })

describe('resizeTarget', () => {
  it('brings the long side of a landscape photo down to 1600', () => {
    expect(resizeTarget(photo(1, 4032, 3024))).toEqual({ width: 1600 })
  })

  it('brings the long side of a portrait photo down to 1600', () => {
    expect(resizeTarget(photo(1, 3024, 4032))).toEqual({ height: 1600 })
  })

  it('leaves a small photo alone', () => {
    expect(resizeTarget(photo(1, 1200, 900))).toBeNull()
  })
})

describe('addPhotos', () => {
  it('stops at three, keeping the ones already there', () => {
    expect(addPhotos([photo(1), photo(2)], [photo(3), photo(4)]).map((p) => p.uri)).toEqual([
      'file:///p1.heic',
      'file:///p2.heic',
      'file:///p3.heic',
    ])
  })
})
