import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { allContent, pathOf } from '@/features/seo-content/load'
import { forbiddenWordsIn, RESERVED_SLUGS, textsOf, type ContentPage } from '@/features/seo-content/schema'
import robots from '@/app/robots'

/**
 * The articles in `apps/web/content/`. Each check here is a rule from
 * content/README.md that a reader could otherwise only catch by reading every
 * page: the schema is enforced by the loader itself.
 */
const { symptoms, toxins } = allContent()
const pages: ContentPage[] = [...symptoms, ...toxins]
const slugs = new Set(pages.map(page => page.slug))

describe('the articles', () => {
  it('are named after their slug', () => {
    for (const [dir, list] of [['symptoms', symptoms], ['toxins', toxins]] as const) {
      const files = readdirSync(join(process.cwd(), 'content', dir)).filter(name => name.endsWith('.json'))
      expect(files.sort()).toEqual(list.map(page => `${page.slug}.json`).sort())
    }
  })

  it('have unique slugs that are not a hub and not closed to robots', () => {
    expect(slugs.size).toBe(pages.length)

    const disallowed = [robots().rules].flat().flatMap(rule => [rule.disallow ?? []].flat())
    for (const page of pages) {
      expect(RESERVED_SLUGS as readonly string[], page.slug).not.toContain(page.slug)
      const path = pathOf(page)
      for (const prefix of disallowed) expect(path.startsWith(prefix), `${path} vs ${prefix}`).toBe(false)
    }
  })

  it('use none of the words that would turn information into a diagnosis or a prescription', () => {
    for (const page of pages) expect(forbiddenWordsIn(page), page.slug).toEqual([])
  })

  it('ask at least one emergency question, and a symptom page one urgent question too', () => {
    for (const page of pages) {
      const levels = page.quiz.map(question => question.level)
      expect(levels, page.slug).toContain('emergency')
      if (page.kind === 'symptom') expect(levels, page.slug).toContain('urgent')
    }
  })

  it('point only at pages that exist, and not at themselves', () => {
    for (const page of pages) {
      for (const slug of page.related) {
        expect(slugs.has(slug), `${page.slug} → ${slug}`).toBe(true)
        expect(slug, page.slug).not.toBe(page.slug)
      }
    }
  })

  it('say when and by whom they were reviewed once they are published', () => {
    for (const page of pages.filter(p => p.review.status !== 'draft')) {
      expect(page.review.reviewedBy, page.slug).toBe('agent')
      expect(page.review.reviewedAt, page.slug).toBeDefined()
      expect(page.review.nextReviewAt, page.slug).toBeDefined()
    }
  })

  it('pair a cat and a dog on one topic at most once each', () => {
    const seen = new Set<string>()
    for (const page of symptoms) {
      const key = `${page.topic}/${page.species}`
      expect(seen.has(key), key).toBe(false)
      seen.add(key)
    }
  })

  it('say different things for a cat and for a dog', () => {
    // A dog page made from the cat one by swapping a word is a duplicate to a
    // search engine and wrong to a reader: thresholds and causes differ.
    for (const cat of symptoms.filter(page => page.species === 'cat')) {
      const dog = symptoms.find(page => page.topic === cat.topic && page.species === 'dog')
      if (!dog) continue
      const normalise = (s: string) => s.toLowerCase().replace(/кошк\S*|кот\S*|собак\S*|пс\S*/g, '').replace(/\s+/g, ' ').trim()
      const catTexts = new Set(textsOf(cat).map(normalise))
      const dogTexts = textsOf(dog).map(normalise)
      const shared = dogTexts.filter(t => catTexts.has(t)).length
      expect(shared / dogTexts.length, cat.topic).toBeLessThan(0.5)
    }
  })
})
