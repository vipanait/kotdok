import { CHECK_SOURCES_MAX, type CheckSource } from '@lapka/contracts'

/**
 * What the analysis reads from the vet knowledge base, and what a check may
 * say about it afterwards (SRC-01).
 *
 * The search returns fragments; a reader is shown articles. So fragments are
 * grouped into numbered materials, the model is asked which numbers it used,
 * and only a number that was really in the context can become a source: a link
 * the search never found cannot be shown, whatever the model answers.
 */

/**
 * A fragment less similar to the description than this is not context.
 * Not calibrated yet: the probe in `scripts/vet-similarity-probe.mjs` sets it.
 */
export const VET_CONTEXT_MIN_SIMILARITY = 0.3

export const NO_VET_CONTEXT = 'No additional context available.'

/** A row of `search_vet_knowledge`. */
export type VetKnowledgeMatch = {
  content: string
  source_title: string | null
  source_url: string | null
  source_name: string | null
  similarity: number
}

/** An article, put together from its fragments; `number` starts at 1, best match first. */
export type VetMaterial = {
  number: number
  title: string
  url: string | null
  publisherKey: string | null
  chunks: string[]
}

/** The corpus is English throughout; `vet_knowledge` has no language column. */
const CORPUS_LANGUAGE = 'en' as const

/** `source_name` as the ingest writes it → the name a reader sees, and where its articles live. */
const PUBLISHERS: Record<string, { name: string; hosts: string[] }> = {
  vca: { name: 'VCA Animal Hospitals', hosts: ['vcahospitals.com'] },
  merck: { name: 'Merck Veterinary Manual', hosts: ['www.merckvetmanual.com'] },
  cornell: {
    name: 'Cornell University College of Veterinary Medicine',
    hosts: ['vet.cornell.edu', 'www.vet.cornell.edu'],
  },
}

/**
 * Pages that answer 404 and stay in the corpus by the owner's decision of
 * 2026-10-25: still context for the model, never a link for a reader. Matched
 * by the last segment of the path.
 */
const GONE_PAGES = new Set([
  'pet-food-and-toy-recalls',
  'diarrhea-questionnaire-and-checklist-for-cats',
  'chinese-crested-dog',
])

export function groupMaterials(rows: VetKnowledgeMatch[]): VetMaterial[] {
  const relevant = rows
    .filter((row) => row.similarity > VET_CONTEXT_MIN_SIMILARITY)
    // Best first, so a material takes the number and the title of its best fragment.
    .sort((a, b) => b.similarity - a.similarity)

  const materials: VetMaterial[] = []
  const byUrl = new Map<string, VetMaterial>()

  for (const row of relevant) {
    const known = row.source_url ? byUrl.get(row.source_url) : undefined
    if (known) {
      known.chunks.push(row.content)
      continue
    }
    const material: VetMaterial = {
      number: materials.length + 1,
      title: row.source_title ?? '',
      url: row.source_url,
      publisherKey: row.source_name,
      chunks: [row.content],
    }
    materials.push(material)
    // A fragment without a link cannot be told from another one: each stands alone.
    if (row.source_url) byUrl.set(row.source_url, material)
  }

  return materials
}

export function renderVetContext(materials: VetMaterial[]): string {
  if (materials.length === 0) return NO_VET_CONTEXT

  return materials
    .flatMap((material) => material.chunks.map((chunk) => `[${material.number}] ${material.title}\n${chunk}`))
    .join('\n\n---\n\n')
}

/**
 * The numbers of the materials the model says it relied on, in its order.
 * Anything that is not a whole number of a material in the context is
 * dropped without a word: the field decides what a reader is shown, and the
 * analysis must not fail over it.
 */
export function parseUsedSources(raw: unknown, materialCount: number): number[] {
  if (!Array.isArray(raw)) return []

  const numbers: number[] = []
  for (const value of raw) {
    if (typeof value !== 'number' || !Number.isInteger(value)) continue
    if (value < 1 || value > materialCount || numbers.includes(value)) continue
    numbers.push(value)
  }
  return numbers
}

/** The material as a reader may be shown it, or `null` when it is not fit to show. */
function toSource(material: VetMaterial): CheckSource | null {
  const title = material.title.trim()
  const publisher = material.publisherKey ? PUBLISHERS[material.publisherKey] : undefined
  if (!title || !publisher || !material.url) return null

  let url: URL
  try {
    url = new URL(material.url)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || !publisher.hosts.includes(url.hostname)) return null

  const lastSegment = url.pathname.split('/').filter(Boolean).pop() ?? ''
  if (GONE_PAGES.has(lastSegment)) return null

  return { title, publisher: publisher.name, url: material.url, lang: CORPUS_LANGUAGE }
}

/** What the check keeps: the marked materials that can be shown, three at most. */
export function pickSources(materials: VetMaterial[], rawUsed: unknown): CheckSource[] {
  const sources: CheckSource[] = []
  for (const number of parseUsedSources(rawUsed, materials.length)) {
    const material = materials.find((candidate) => candidate.number === number)
    const source = material ? toSource(material) : null
    if (source) sources.push(source)
    if (sources.length === CHECK_SOURCES_MAX) break
  }
  return sources
}
