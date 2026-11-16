/**
 * The first segments of the static articles in `app/(content)`. These pages
 * are prerendered and skip `src/proxy.ts` (its matcher lists the same words —
 * a matcher has to be a literal, so a test keeps the two in step) and get the
 * static policy from `next.config.ts` instead of a nonce.
 */
export const CONTENT_SEGMENTS = ['simptomy', 'otravlenie', 'o-materialah', 'mozhno-li'] as const

export type ContentSegment = (typeof CONTENT_SEGMENTS)[number]

/**
 * The site path of a «Можно ли» reference entry. Here rather than in the
 * server-only loader, so the hub's search can link from the browser too.
 */
export function safetyPath(slug: string): string {
  return `/mozhno-li/${slug}`
}
