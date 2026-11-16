import { describe, expect, it } from 'vitest'
import {
  NO_VET_CONTEXT,
  VET_CONTEXT_MIN_SIMILARITY,
  groupMaterials,
  parseUsedSources,
  pickSources,
  renderVetContext,
  stripSourceMarks,
  type VetKnowledgeMatch,
  type VetMaterial,
} from '@/server/symptom-check/vet-sources'

const VCA_URL = 'https://vcahospitals.com/know-your-pet/vomiting-in-cats'
const MERCK_URL = 'https://www.merckvetmanual.com/cat-owners/digestive-disorders-of-cats/vomiting-in-cats'

function match(over: Partial<VetKnowledgeMatch> = {}): VetKnowledgeMatch {
  return {
    content: 'Vomiting is common in cats.',
    source_title: 'Vomiting in Cats',
    source_url: VCA_URL,
    source_name: 'vca',
    similarity: 0.5,
    ...over,
  }
}

function material(over: Partial<VetMaterial> = {}): VetMaterial {
  return { number: 1, title: 'Vomiting in Cats', url: VCA_URL, publisherKey: 'vca', chunks: ['text'], ...over }
}

describe('materials of the vet context', () => {
  it('drops a fragment at the threshold or under it', () => {
    const materials = groupMaterials([
      match({ similarity: VET_CONTEXT_MIN_SIMILARITY, source_url: 'https://vcahospitals.com/a' }),
      match({ similarity: VET_CONTEXT_MIN_SIMILARITY - 0.01, source_url: 'https://vcahospitals.com/b' }),
      match({ similarity: VET_CONTEXT_MIN_SIMILARITY + 0.01, source_url: 'https://vcahospitals.com/c' }),
    ])

    expect(materials.map((m) => m.url)).toEqual(['https://vcahospitals.com/c'])
  })

  it('makes one material of the fragments of one article', () => {
    const materials = groupMaterials([
      match({ content: 'first', similarity: 0.6 }),
      match({ content: 'other', source_url: MERCK_URL, source_name: 'merck', similarity: 0.55 }),
      match({ content: 'second', similarity: 0.5 }),
    ])

    expect(materials).toHaveLength(2)
    expect(materials[0]).toMatchObject({ number: 1, url: VCA_URL, chunks: ['first', 'second'] })
    expect(materials[1]).toMatchObject({ number: 2, url: MERCK_URL, publisherKey: 'merck' })
  })

  it('numbers materials by their best fragment, whatever order they came in', () => {
    const materials = groupMaterials([
      match({ source_url: 'https://vcahospitals.com/low', similarity: 0.4 }),
      match({ source_url: 'https://vcahospitals.com/high', similarity: 0.7 }),
    ])

    expect(materials.map((m) => [m.number, m.url])).toEqual([
      [1, 'https://vcahospitals.com/high'],
      [2, 'https://vcahospitals.com/low'],
    ])
  })

  it('takes the title of the best fragment when one article carries two', () => {
    const [only] = groupMaterials([
      match({ source_title: 'Older title', similarity: 0.4 }),
      match({ source_title: 'Better title', similarity: 0.8 }),
    ])

    expect(only.title).toBe('Better title')
  })

  it('keeps fragments without a link apart', () => {
    const materials = groupMaterials([
      match({ source_url: null, content: 'a' }),
      match({ source_url: null, content: 'b' }),
    ])

    expect(materials).toHaveLength(2)
  })
})

describe('the context as the model reads it', () => {
  it('says so when there is nothing', () => {
    expect(renderVetContext([])).toBe(NO_VET_CONTEXT)
  })

  it('labels every fragment with the number of its material', () => {
    const context = renderVetContext([
      material({ number: 1, title: 'Vomiting in Cats', chunks: ['first', 'second'] }),
      material({ number: 2, title: 'Gastritis', chunks: ['third'] }),
    ])

    expect(context).toBe(
      '[1] Vomiting in Cats\nfirst\n\n---\n\n[1] Vomiting in Cats\nsecond\n\n---\n\n[2] Gastritis\nthird',
    )
  })
})

describe('the numbers the model says it used', () => {
  it('keeps the order the model gave', () => {
    expect(parseUsedSources([2, 1], 3)).toEqual([2, 1])
  })

  it('drops anything that is not a number of a material', () => {
    expect(parseUsedSources([1, 1, 5, 0, -1, 1.5, '2', null], 3)).toEqual([1])
  })

  it('reads nothing from an answer that is not a list', () => {
    for (const raw of ['1', 1, undefined, null, {}]) expect(parseUsedSources(raw, 3)).toEqual([])
  })
})

describe('the sources a check keeps', () => {
  it('names the article, its publisher and its link', () => {
    expect(pickSources([material({ title: '  Vomiting in Cats ' })], [1])).toEqual([
      { title: 'Vomiting in Cats', publisher: 'VCA Animal Hospitals', url: VCA_URL, lang: 'en' },
    ])
  })

  it('names every publisher of the corpus', () => {
    const sources = pickSources(
      [
        material({ number: 1, url: MERCK_URL, publisherKey: 'merck' }),
        material({ number: 2, url: 'https://vet.cornell.edu/a', publisherKey: 'cornell' }),
        material({ number: 3, url: 'https://www.vet.cornell.edu/b', publisherKey: 'cornell' }),
      ],
      [1, 2, 3],
    )

    expect(sources.map((s) => s.publisher)).toEqual([
      'Merck Veterinary Manual',
      'Cornell University College of Veterinary Medicine',
      'Cornell University College of Veterinary Medicine',
    ])
  })

  it.each([
    ['an empty title', { title: '   ' }],
    ['a link that is not https', { url: 'http://vcahospitals.com/know-your-pet/vomiting-in-cats' }],
    ['no link', { url: null }],
    ['a link that is not one', { url: 'vomiting-in-cats' }],
    ['a host that is nobody\'s', { url: 'https://evil.example/know-your-pet/vomiting-in-cats' }],
    ['a host of another publisher', { url: MERCK_URL }],
    ['a host that only starts like the publisher\'s', { url: 'https://vcahospitals.com.evil.example/a' }],
    ['an unknown publisher', { publisherKey: 'petmd' }],
    ['no publisher', { publisherKey: null }],
    ['a page that is gone (Cornell recalls)', {
      publisherKey: 'cornell',
      url: 'https://vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/pet-food-and-toy-recalls',
    }],
    ['a page that is gone (VCA checklist)', {
      url: 'https://vcahospitals.com/know-your-pet/diarrhea-questionnaire-and-checklist-for-cats',
    }],
    ['a page that is gone (VCA breed)', { url: 'https://vcahospitals.com/know-your-pet/dog-breeds/chinese-crested-dog' }],
  ])('leaves out a material with %s', (_name, over) => {
    expect(pickSources([material(over)], [1])).toEqual([])
  })

  it('fills three places with materials it can show', () => {
    const materials = [
      material({ number: 1, title: '' }),
      ...[2, 3, 4, 5].map((number) => material({ number, title: `Article ${number}`, url: `${VCA_URL}-${number}` })),
    ]

    expect(pickSources(materials, [1, 2, 3, 4, 5]).map((s) => s.title)).toEqual([
      'Article 2',
      'Article 3',
      'Article 4',
    ])
  })

  it('keeps nothing when nothing was found or nothing was marked', () => {
    expect(pickSources([], [1])).toEqual([])
    expect(pickSources([material()], [])).toEqual([])
    expect(pickSources([material()], undefined)).toEqual([])
    expect(pickSources([material()], ['1'])).toEqual([])
  })
})

describe('the answer text, without the numbers of the context', () => {
  it('takes out a number the model left in a sentence', () => {
    expect(stripSourceMarks('Vomiting can mean hairballs [1].')).toBe('Vomiting can mean hairballs.')
    expect(stripSourceMarks('Рвота [1][2] и вялость [1, 3]')).toBe('Рвота и вялость')
    expect(stripSourceMarks('[2] Дайте воды')).toBe('Дайте воды')
  })

  it('leaves text without marks as it was', () => {
    expect(stripSourceMarks('Наблюдайте 48 часов')).toBe('Наблюдайте 48 часов')
    expect(stripSourceMarks('Дозировка [по весу] у врача')).toBe('Дозировка [по весу] у врача')
  })
})
