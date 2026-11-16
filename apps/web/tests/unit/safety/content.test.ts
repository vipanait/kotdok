import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeSafetyQuery } from '@lapka/shared'
import { allEntries, entryBySlug, publishedEntries, safetyIndex, visibleEntries } from '@/features/safety/load'
import {
  SAFETY_FORBIDDEN_WORDS_EN,
  advisesVomiting,
  safetyEntrySchema,
  safetyWordingProblems,
  textsOfEntry,
  type SafetyEntry,
} from '@/features/safety/schema'
import { FORBIDDEN_WORDS, forbiddenWordPattern } from '@/features/seo-content/schema'

/**
 * The «Можно ли» reference in `apps/web/content/safety/`. The schema carries
 * the rules a broken file must not get past (verdict ⇄ ifEaten, medicine and
 * household verdicts); the checks here are the ones across files and over
 * the wording, from content/README.md.
 */
const DIR = join(process.cwd(), 'content', 'safety')
const entries = allEntries()
const SPECIES = ['cat', 'dog'] as const
const LOCALES = ['ru', 'en'] as const

/** A valid entry to break one field at a time. */
function validEntry(): Record<string, unknown> {
  const section = (verdict: string, ifEaten: string) => ({
    verdict,
    summary: { ru: 'Кратко.', en: 'In short.' },
    why: { ru: 'Потому что.', en: 'Because.' },
    signs: { ru: ['рвота', 'вялость'], en: ['vomiting', 'lethargy'] },
    ifEaten,
  })
  return {
    slug: 'test-item',
    category: 'food',
    name: { ru: 'Тест', en: 'Test' },
    aliases: { ru: [], en: [] },
    bySpecies: { cat: section('danger', 'call_now'), dog: section('caution', 'watch') },
    firstSteps: { ru: ['Позвоните в клинику'], en: ['Call a clinic'] },
    avoid: { ru: ['Не вызывайте рвоту сами — только по указанию врача'], en: ['Do not induce vomiting unless a vet tells you to'] },
    sources: [{ title: 'ASPCA Animal Poison Control' }],
    review: { status: 'draft', draftedBy: 'model' },
  }
}

type Mutable = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

describe('the safety schema', () => {
  it('accepts the sample entry', () => {
    expect(safetyEntrySchema.safeParse(validEntry()).success).toBe(true)
  })

  it.each<[string, (entry: Mutable) => void]>([
    ['an entry without a dog section', e => delete e.bySpecies.dog],
    ['danger with ifEaten none', e => (e.bySpecies.cat.ifEaten = 'none')],
    ['safe with ifEaten other than none', e => Object.assign(e.bySpecies.dog, { verdict: 'safe', ifEaten: 'watch' })],
    ['an empty English name', e => (e.name.en = '')],
    ['a medicine with caution', e => (e.category = 'medicine')],
    ['a household substance with safe', e => {
      e.category = 'household'
      Object.assign(e.bySpecies.dog, { verdict: 'safe', ifEaten: 'none' })
    }],
    ['danger with a single sign', e => (e.bySpecies.cat.signs.en = ['vomiting'])],
    ['first steps missing when something must be done', e => (e.firstSteps.en = [])],
    ['no sources', e => (e.sources = [])],
    ['more than three sources', e => (e.sources = Array(4).fill({ title: 'MSD Veterinary Manual' }))],
  ])('rejects %s', (_, breakIt) => {
    const entry = validEntry() as Mutable
    breakIt(entry)
    expect(safetyEntrySchema.safeParse(entry).success).toBe(false)
  })
})

describe('advisesVomiting', () => {
  // Advice to make a pet vomit trips; vomiting described as a sign does not (controller ruling, SAFE-06).
  it.each([
    'Вызовите рвоту.',
    'Вызывайте рвоту, если съел.',
    'Вызовите у питомца рвоту солёной водой.',
    'Нужно вызвать рвоту как можно скорее.',
    'Можно вызвать рвоту дома.',
    'Стоит вызвать рвоту.',
    'Вызвать рвоту в первые полчаса.',
    'Если собака не ест, нужно вызвать рвоту.',
    'Спровоцируйте рвоту.',
  ])('trips on Russian advice: %s', text => {
    expect(advisesVomiting(text, 'ru')).toBe(true)
  })

  it.each([
    'Может вызвать рвоту и понос.',
    'Шоколад вызывает рвоту.',
    'Косточки вызывают рвоту и понос.',
    'Молочное может вызвать понос, жирное — рвоту и понос.',
    'Не вызывайте рвоту сами — только по указанию врача',
    'Не вызывайте рвоту сами\u00a0— только по\u00a0указанию врача',
    'Не нужно вызывать рвоту.',
    'Нельзя вызывать рвоту.',
    'Может вызвать отказ почек.',
  ])('passes a Russian sign or the allowed line: %s', text => {
    expect(advisesVomiting(text, 'ru')).toBe(false)
  })

  it.each([
    'Induce vomiting at once.',
    'You can induce vomiting with peroxide.',
    'Make your pet vomit.',
    'Make him vomit right away.',
    'Make her vomit.',
    'Make it vomit.',
    'Cause vomiting at home.',
    'Try to cause vomiting at home.',
  ])('trips on English advice: %s', text => {
    expect(advisesVomiting(text, 'en')).toBe(true)
  })

  it.each([
    'Chocolate can cause vomiting.',
    'Bones may cause vomiting and diarrhoea.',
    'Rich food makes some dogs vomit.',
    'Do not make your pet vomit unless a vet tells you to',
    'Do not induce vomiting unless a vet tells you to',
  ])('passes an English sign or the allowed line: %s', text => {
    expect(advisesVomiting(text, 'en')).toBe(false)
  })

  it('is what the wording check uses, and the strict AI option still trips on a sign', () => {
    expect(safetyWordingProblems(['Может вызвать рвоту.'], 'ru')).toEqual([])
    expect(safetyWordingProblems(['Вызовите рвоту.'], 'ru')).toEqual(['vomiting'])
    expect(safetyWordingProblems(['Может вызвать рвоту.'], 'ru', { strictVomiting: true })).toEqual(['vomiting'])
    expect(safetyWordingProblems(['Can make it vomit.'], 'en', { strictVomiting: true })).toEqual(['vomiting'])
    expect(safetyWordingProblems(['Не вызывайте рвоту сами — только по указанию врача'], 'ru', { strictVomiting: true })).toEqual([])
  })
})

describe('the safety entries', () => {
  it('are named after their slug', () => {
    const files = readdirSync(DIR).filter(name => name.endsWith('.json'))
    expect(files.sort()).toEqual(entries.map(entry => `${entry.slug}.json`).sort())
    // Each file on its own, so a failure names the file.
    for (const file of files) {
      const result = safetyEntrySchema.safeParse(JSON.parse(readFileSync(join(DIR, file), 'utf8')))
      expect(result.success, `${file}: ${result.error?.message}`).toBe(true)
    }
  })

  it('tie the verdict to what to do if eaten', () => {
    for (const entry of entries) {
      for (const species of SPECIES) {
        const section = entry.bySpecies[species]
        const at = `${entry.slug}/${species}`
        if (section.verdict === 'danger') {
          expect(section.ifEaten, at).toBe('call_now')
          expect(section.signs.ru.length, at).toBeGreaterThanOrEqual(2)
          expect(section.signs.en.length, at).toBeGreaterThanOrEqual(2)
        }
        if (section.verdict === 'safe') expect(section.ifEaten, at).toBe('none')
      }
    }
  })

  it('call every medicine dangerous and no household substance safe', () => {
    for (const entry of entries) {
      const verdicts = SPECIES.map(species => entry.bySpecies[species].verdict)
      if (entry.category === 'medicine') expect(verdicts, entry.slug).toEqual(['danger', 'danger'])
      if (entry.category === 'household') expect(verdicts, entry.slug).not.toContain('safe')
    }
  })

  it('say what to do and what not to, in both languages, when something must be done', () => {
    for (const entry of entries.filter(e => SPECIES.some(s => e.bySpecies[s].ifEaten !== 'none'))) {
      for (const locale of LOCALES) {
        expect(entry.firstSteps[locale].length, `${entry.slug} firstSteps.${locale}`).toBeGreaterThan(0)
        expect(entry.avoid[locale].length, `${entry.slug} avoid.${locale}`).toBeGreaterThan(0)
      }
    }
  })

  it('have as many signs, first steps and don’ts in English as in Russian', () => {
    for (const entry of entries) {
      const lists = {
        ...Object.fromEntries(SPECIES.map(species => [`bySpecies.${species}.signs`, entry.bySpecies[species].signs])),
        firstSteps: entry.firstSteps,
        avoid: entry.avoid,
      }
      for (const [field, list] of Object.entries(lists)) {
        expect(list.en.length, `${entry.slug} ${field}`).toBe(list.ru.length)
      }
    }
  })

  it('give each name and alias to one entry only', () => {
    for (const locale of LOCALES) {
      const owner = new Map<string, string>()
      for (const entry of entries) {
        const terms = new Set([entry.name[locale], ...entry.aliases[locale]].map(normalizeSafetyQuery))
        for (const term of terms) {
          expect(owner.get(term), `«${term}» in ${entry.slug} and ${owner.get(term)}`).toBeUndefined()
          owner.set(term, entry.slug)
        }
      }
    }
  })

  it('do not stretch a «safe» plain food over dishes made from it (final review)', () => {
    // A dish adds what the plain food lacks — butter, milk, sauce, salt — so «пюре» is not «варёный картофель».
    const dishes = ['картофельное пюре', 'пюре', 'mashed potato', 'mashed potatoes', 'рисовая каша', 'рисовую кашу', 'rice porridge', 'спагетти', 'spaghetti']
    for (const slug of ['vareny-kartofel', 'ris', 'makarony']) {
      const entry = entries.find(e => e.slug === slug)!
      const aliases = [...entry.aliases.ru, ...entry.aliases.en].map(normalizeSafetyQuery)
      for (const dish of dishes) expect(aliases, `${slug}: ${dish}`).not.toContain(normalizeSafetyQuery(dish))
      expect(aliases.some(alias => alias.includes('пюре')), slug).toBe(false)
    }
  })

  it('use none of the words that would turn information into a diagnosis or a prescription', () => {
    for (const entry of entries) {
      const ru = textsOfEntry(entry, 'ru')
      const en = textsOfEntry(entry, 'en')
      for (const word of FORBIDDEN_WORDS) expect(ru.filter(t => forbiddenWordPattern(word).test(t)), `${entry.slug}: ${word}`).toEqual([])
      for (const word of SAFETY_FORBIDDEN_WORDS_EN) expect(en.filter(t => forbiddenWordPattern(word).test(t)), `${entry.slug}: ${word}`).toEqual([])
    }
  })

  it('advise making a pet vomit only as «only if a vet says so»', () => {
    for (const entry of entries) {
      for (const locale of LOCALES) {
        expect(textsOfEntry(entry, locale).filter(text => advisesVomiting(text, locale)), entry.slug).toEqual([])
      }
    }
  })

  it('point at poisoning pages that exist', () => {
    for (const entry of entries.filter(e => e.toxinSlug)) {
      expect(existsSync(join(process.cwd(), 'content', 'toxins', `${entry.toxinSlug}.json`)), entry.slug).toBe(true)
    }
  })

  it('say when and by whom they were reviewed once past a draft', () => {
    for (const entry of entries.filter(e => e.review.status !== 'draft')) {
      expect(entry.review.reviewedBy, entry.slug).toBe('agent')
      expect(entry.review.reviewedAt, entry.slug).toBeDefined()
      expect(entry.review.nextReviewAt, entry.slug).toBeDefined()
    }
  })
})

describe('the safety loader', () => {
  // Tests run with NODE_ENV=test, where drafts are hidden as in production.
  beforeEach(() => vi.stubEnv('VERCEL_ENV', 'preview'))
  afterEach(() => vi.unstubAllEnvs())

  it('builds a light index in the asked language', () => {
    const grapes = entries.find(entry => entry.slug === 'vinograd') as SafetyEntry
    const ru = safetyIndex('ru').find(item => item.slug === 'vinograd')
    const en = safetyIndex('en').find(item => item.slug === 'vinograd')
    expect(ru).toEqual({
      slug: 'vinograd',
      category: grapes.category,
      name: grapes.name.ru,
      aliases: grapes.aliases.ru,
      verdict: { cat: grapes.bySpecies.cat.verdict, dog: grapes.bySpecies.dog.verdict },
    })
    expect(en?.name).toBe(grapes.name.en)
  })

  it('finds an entry by slug in a preview, drafts included, and nothing by an unknown one', () => {
    expect(entryBySlug('vinograd')?.slug).toBe('vinograd')
    expect(entryBySlug('net-takoy')).toBeUndefined()
  })

  it('shows only published entries in production', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NODE_ENV', 'production')
    expect(visibleEntries().every(entry => entry.review.status === 'published')).toBe(true)
    expect(publishedEntries().every(entry => entry.review.status === 'published')).toBe(true)
  })
})
