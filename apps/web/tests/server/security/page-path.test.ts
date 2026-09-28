import { describe, expect, it } from 'vitest'
import { pagePathOf, petReturnPath } from '@/server/security/page-path'

const pet = 'cc4df1d5-35a2-45ae-9522-c85ffa50e6ff'

describe('the page a request asked for, as the proxy passes it on', () => {
  it('keeps the path and the query', () => {
    expect(pagePathOf(new URL(`http://localhost:3100/pets/${pet}/health/new?type=weight&from=form`))).toBe(
      `/pets/${pet}/health/new?type=weight&from=form`,
    )
    expect(pagePathOf(new URL(`http://localhost:3100/pets/${pet}/edit`))).toBe(`/pets/${pet}/edit`)
  })

  it('leaves out Next’s own _rsc of a navigation', () => {
    expect(pagePathOf(new URL(`http://localhost:3100/pets/${pet}/vet-summary?_rsc=1x2y`))).toBe(`/pets/${pet}/vet-summary`)
    expect(pagePathOf(new URL(`http://localhost:3100/pets/${pet}/health/new?_rsc=1&type=visit`))).toBe(`/pets/${pet}/health/new?type=visit`)
  })
})

describe('where the pet gate brings the visitor back to (MW-09)', () => {
  it('is the page asked for when it is a page of this pet', () => {
    for (const page of [
      `/pets/${pet}`,
      `/pets/${pet}/edit`,
      `/pets/${pet}/vet-summary`,
      `/pets/${pet}/health/vaccinations`,
      `/pets/${pet}/health/eaf02c42-78b9-48ee-b931-d944c00fd0bd/edit`,
      `/pets/${pet}/health/new?type=weight&from=form`,
      `/pets/${pet}?saved=form`,
    ]) {
      expect(petReturnPath(pet, page)).toBe(page)
    }
  })

  it('is the record when there is no page, or it is another pet’s or another site’s', () => {
    const record = `/pets/${pet}`
    for (const asked of [
      null,
      '',
      '/pets/00000000-0000-4000-8000-000000000000/edit',
      `/pets/${pet}x/edit`,
      `/pets/${pet}-evil`,
      'https://evil.example/pets',
      '//evil.example/x',
      '/\\evil.example',
      `/pets/${pet}/../../dashboard`,
      'pets/relative',
      '/dashboard',
    ]) {
      expect(petReturnPath(pet, asked), String(asked)).toBe(record)
    }
  })
})
