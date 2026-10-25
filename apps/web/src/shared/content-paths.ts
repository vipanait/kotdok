/**
 * The first segments of the static articles in `app/(content)`. These pages
 * are prerendered and skip `src/proxy.ts` (its matcher lists the same words —
 * a matcher has to be a literal, so a test keeps the two in step) and get the
 * static policy from `next.config.ts` instead of a nonce.
 */
export const CONTENT_SEGMENTS = ['simptomy', 'otravlenie', 'o-materialah'] as const

export type ContentSegment = (typeof CONTENT_SEGMENTS)[number]
