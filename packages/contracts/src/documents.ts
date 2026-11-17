import { z } from 'zod'
import { CalendarDateSchema, IsoDateTimeSchema, UuidSchema } from './primitives'

// Pet documents (DOC-1): photos of pages or one PDF kept with the pet.
// The spec: docs/superpowers/specs/2026-11-13-pet-documents-recognition-design.md.

export const DOCUMENT_KINDS = ['vet_passport', 'prescription', 'discharge', 'lab_results', 'other'] as const
/** The kinds the AI reads (DOC-2); the others are only stored. */
export const RECOGNIZABLE_KINDS = ['vet_passport', 'prescription'] as const
export const DOCUMENT_STATUSES = ['pending', 'stored', 'recognizing', 'review', 'confirmed', 'failed'] as const
export const DOCUMENT_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const

export const DocumentKindSchema = z.enum(DOCUMENT_KINDS)
export const DocumentStatusSchema = z.enum(DOCUMENT_STATUSES)
export type DocumentKind = z.infer<typeof DocumentKindSchema>
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>

/**
 * The same numbers sit in the bucket settings. `grantSeconds` is how long an
 * upload may wait before it is completed; `clientLongSide` and `clientQuality`
 * are how the apps shrink a photo before sending.
 */
export const DOCUMENT_LIMITS = {
  imageMaxBytes: 5 * 1024 * 1024,
  imageMaxSide: 4096,
  maxImages: 8,
  pdfMaxBytes: 10 * 1024 * 1024,
  pdfMaxPages: 10,
  perPet: 30,
  titleMax: 100,
  grantSeconds: 15 * 60,
  clientLongSide: 2000,
  clientQuality: 0.8,
} as const

const PDF = 'application/pdf'

const titleSchema = z.string().trim().min(1).max(DOCUMENT_LIMITS.titleMax)

const FileRequestSchema = z.strictObject({
  content_type: z.enum(DOCUMENT_CONTENT_TYPES),
  size_bytes: z.int().min(1).max(DOCUMENT_LIMITS.pdfMaxBytes),
})

/** One to eight images, or exactly one PDF; never both. Each file is capped by its type. */
export const DocumentCreateInputSchema = z
  .strictObject({
    kind: DocumentKindSchema,
    title: titleSchema.optional(),
    files: z.array(FileRequestSchema).min(1).max(DOCUMENT_LIMITS.maxImages),
  })
  .superRefine((value, ctx) => {
    const pdfs = value.files.filter((file) => file.content_type === PDF).length
    if (pdfs > 0 && value.files.length > 1) {
      ctx.addIssue({ code: 'custom', path: ['files'], message: 'a pdf is one file, not mixed with others' })
    }
    value.files.forEach((file, index) => {
      if (file.content_type !== PDF && file.size_bytes > DOCUMENT_LIMITS.imageMaxBytes) {
        ctx.addIssue({ code: 'custom', path: ['files', index, 'size_bytes'], message: 'image is too large' })
      }
    })
  })

export type DocumentCreateInput = z.infer<typeof DocumentCreateInputSchema>

/** Permission to write each file straight to storage; the bytes never pass through the API. */
export const DocumentGrantSchema = z.strictObject({
  document_id: UuidSchema,
  uploads: z.array(
    z.strictObject({
      file_id: UuidSchema,
      url: z.url(),
      method: z.literal('PUT'),
      headers: z.record(z.string(), z.string()),
      expires_at: IsoDateTimeSchema,
    }),
  ),
})

export type DocumentGrant = z.infer<typeof DocumentGrantSchema>

export const DocumentPatchSchema = z
  .strictObject({
    title: titleSchema.optional(),
    kind: DocumentKindSchema.optional(),
    document_date: CalendarDateSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'at least one field is required' })

export type DocumentPatch = z.infer<typeof DocumentPatchSchema>

/**
 * A document as a client reads it. Not strict: a field a later server adds is
 * dropped by an older app. `url` is a signed read link.
 */
export const PetDocumentSchema = z.object({
  id: UuidSchema,
  kind: DocumentKindSchema,
  title: z.string(),
  document_date: CalendarDateSchema.nullable(),
  status: DocumentStatusSchema,
  failure_code: z.string().nullable(),
  page_count: z.number().int().nullable(),
  created_at: IsoDateTimeSchema,
  files: z.array(
    z.object({
      id: UuidSchema,
      content_type: z.enum(DOCUMENT_CONTENT_TYPES),
      url: z.string(),
      page_count: z.number().int().nullable(),
    }),
  ),
  // DOC-2 narrows this to the suggested records.
  draft: z.unknown().nullable().default(null),
})

export type PetDocument = z.infer<typeof PetDocumentSchema>

export const DocumentListSchema = z.object({
  documents: z.array(PetDocumentSchema),
  free_recognitions_left: z.number().int(),
  /** Credits one recognition costs now: 0 while free ones last. */
  recognition_price: z.union([z.literal(0), z.literal(1)]),
})

export type DocumentList = z.infer<typeof DocumentListSchema>

/**
 * A document as an app reads it, tolerant of a later server: a kind this
 * build does not know is read as `other` (named «Документ»), a status it does
 * not know as `stored` (no status shown — the file is simply there), and a
 * file of a type it cannot show is left out. The documented
 * {@link PetDocumentSchema} stays closed; this is only the read side.
 */
export function readableDocument(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const doc = value as { kind?: unknown; status?: unknown; files?: unknown }
  return {
    ...doc,
    kind: typeof doc.kind === 'string' && !(DOCUMENT_KINDS as readonly string[]).includes(doc.kind) ? 'other' : doc.kind,
    status:
      typeof doc.status === 'string' && !(DOCUMENT_STATUSES as readonly string[]).includes(doc.status) ? 'stored' : doc.status,
    files: Array.isArray(doc.files)
      ? doc.files.filter(
          (file) =>
            !file ||
            typeof file !== 'object' ||
            (DOCUMENT_CONTENT_TYPES as readonly unknown[]).includes((file as { content_type?: unknown }).content_type),
        )
      : doc.files,
  }
}

export const PetDocumentReadSchema = z.preprocess(readableDocument, PetDocumentSchema)

/**
 * The list's shape as an app reads it: the price of a recognition is any
 * whole number of credits, not only the 0 or 1 of today — a later price must
 * not take the whole list down. The documented {@link DocumentListSchema}
 * stays 0 | 1.
 */
const DocumentListReadShape = DocumentListSchema.extend({
  recognition_price: z.number().int().nonnegative(),
})

/**
 * The list as an app reads it: each document through {@link readableDocument},
 * and one that still does not read is left out rather than taking the whole
 * list down with it.
 */
export const DocumentListReadSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object') return value
  const list = value as { documents?: unknown }
  if (!Array.isArray(list.documents)) return value
  return {
    ...list,
    documents: list.documents.map(readableDocument).filter((doc) => PetDocumentSchema.safeParse(doc).success),
  }
}, DocumentListReadShape)
