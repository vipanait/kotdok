import 'server-only'

import { randomUUID } from 'node:crypto'
import {
  type DocumentCreateInput,
  type DocumentGrant,
  type DocumentList,
  type DocumentPatch,
  type PetDocument,
} from '@lapka/contracts'
import type { createServiceClient } from '@/server/supabase/server'
import type { DocumentStorage } from './document-storage'
import { verifyDocumentFile, type DocumentContentType } from './document-verify'

type SupabaseService = ReturnType<typeof createServiceClient>

/**
 * Pet documents (DOC-1): photos of pages or one PDF kept with the pet.
 *
 * As with the pet's photo, the phone writes each file straight to Storage
 * through a grant, and the server is told only that it is done. `complete`
 * downloads the files and decides from their bytes whether they are what was
 * declared; a document with a bad file goes, objects first, then rows.
 *
 * Every function filters by the owner itself: the service role sees all rows.
 * A document of someone else, of a deleted pet or of another pet is `not_found`.
 */

export type DocumentFailure =
  | 'not_found'
  | 'limit_reached'
  | 'unsupported_media_type'
  | 'payload_too_large'
  | 'too_many_pages'
  | 'encrypted'
  | 'wrong_status'
  | 'storage_error'

export type DocumentResult<T = void> = { ok: true; value: T } | { ok: false; reason: DocumentFailure }

/** What the sweep and the clean-ups need. */
export type DocumentDeps = { supabase: SupabaseService; storage: DocumentStorage }
export type DocumentContext = DocumentDeps & { userId: string }

/** How long a read link lives: long enough for a screen, short enough not to be shared. */
const READ_SECONDS = 60 * 60

/** The most a `pending` document may wait for `complete`: the Storage URL of a grant lives two hours. */
const COMPLETE_WITHIN_SECONDS = 2 * 60 * 60

/** A grant's two hours of signed URL, plus room for a slow write. */
const SWEEP_AFTER_SECONDS = 3 * 60 * 60

/** Free recognitions every pet starts with; the counter itself arrives with DOC-2. */
const FREE_RECOGNITIONS = 3

const fail = (reason: DocumentFailure) => ({ ok: false as const, reason })
const ok = <T>(value: T) => ({ ok: true as const, value })

type DocumentRow = {
  id: string
  kind: PetDocument['kind']
  title: string
  document_date: string | null
  status: PetDocument['status']
  failure_code: string | null
  draft: unknown
  created_at: string
}

type FileRow = {
  id: string
  document_id: string
  position: number
  object_path: string
  content_type: DocumentContentType
  size_bytes: number
  page_count: number | null
}

const DOCUMENT_COLUMNS = 'id, kind, title, document_date, status, failure_code, draft, created_at'
const FILE_COLUMNS = 'id, document_id, position, object_path, content_type, size_bytes, page_count'

async function ownPet(ctx: DocumentContext, petId: string): Promise<DocumentResult> {
  const { data, error } = await ctx.supabase
    .from('pets')
    .select('id')
    .eq('id', petId)
    .eq('user_id', ctx.userId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) return fail('storage_error')
  return data ? ok(undefined) : fail('not_found')
}

async function ownDocument(ctx: DocumentContext, petId: string, docId: string): Promise<DocumentResult<DocumentRow>> {
  const pet = await ownPet(ctx, petId)
  if (!pet.ok) return pet
  const { data, error } = await ctx.supabase
    .from('pet_documents')
    .select(DOCUMENT_COLUMNS)
    .eq('id', docId)
    .eq('pet_id', petId)
    .eq('user_id', ctx.userId)
    .maybeSingle()
  if (error) return fail('storage_error')
  return data ? ok(data as DocumentRow) : fail('not_found')
}

async function filesOf(ctx: DocumentContext, docIds: string[]): Promise<DocumentResult<FileRow[]>> {
  if (docIds.length === 0) return ok([])
  const { data, error } = await ctx.supabase
    .from('pet_document_files')
    .select(FILE_COLUMNS)
    .in('document_id', docIds)
    .eq('user_id', ctx.userId)
    .order('position')
  if (error) return fail('storage_error')
  return ok((data ?? []) as FileRow[])
}

/** Documents as a client reads them, with one signing call for every file. */
async function present(ctx: DocumentContext, docs: DocumentRow[]): Promise<DocumentResult<PetDocument[]>> {
  const files = await filesOf(ctx, docs.map((doc) => doc.id))
  if (!files.ok) return files
  const urls = await ctx.storage.signRead(files.value.map((file) => file.object_path), READ_SECONDS)
  // A document without its link is no use to the client: say so, do not hand out ''.
  if (urls.length !== files.value.length || urls.some((url) => !url)) return fail('storage_error')
  const urlOf = new Map(files.value.map((file, i) => [file.id, urls[i] as string]))

  return ok(
    docs.map((doc) => {
      const own = files.value.filter((file) => file.document_id === doc.id)
      const pages = own.map((file) => file.page_count)
      return {
        id: doc.id,
        kind: doc.kind,
        title: doc.title,
        document_date: doc.document_date,
        status: doc.status,
        failure_code: doc.failure_code,
        page_count: pages.length > 0 && pages.every((n) => n !== null) ? pages.reduce<number>((a, n) => a + (n ?? 0), 0) : null,
        created_at: doc.created_at,
        files: own.map((file) => ({
          id: file.id,
          content_type: file.content_type,
          url: urlOf.get(file.id) as string,
          page_count: file.page_count,
        })),
        draft: doc.draft ?? null,
      }
    }),
  )
}

async function presentOne(ctx: DocumentContext, doc: DocumentRow): Promise<DocumentResult<PetDocument>> {
  const shown = await present(ctx, [doc])
  return shown.ok ? ok(shown.value[0]!) : shown
}

/** Objects first, then rows: a row never outlives the objects it is the only pointer to. Never throws. */
async function removeDocumentsOf(ctx: DocumentDeps, docIds: string[]): Promise<boolean> {
  if (docIds.length === 0) return true
  const { data, error } = await ctx.supabase.from('pet_document_files').select('object_path').in('document_id', docIds)
  if (error) return false
  let clean = true
  try {
    await ctx.storage.remove((data ?? []).map((file: { object_path: string }) => file.object_path))
  } catch {
    clean = false
  }
  // Rows go even when an object stayed: the sweep finds an object no row points at.
  const { error: deleteError } = await ctx.supabase.from('pet_documents').delete().in('id', docIds)
  return clean && !deleteError
}

export async function createDocument(
  ctx: DocumentContext,
  petId: string,
  input: DocumentCreateInput,
): Promise<DocumentResult<DocumentGrant>> {
  const pet = await ownPet(ctx, petId)
  if (!pet.ok) return pet

  const documentId = randomUUID()
  const planned = input.files.map((file, position) => ({
    id: randomUUID(),
    position,
    path: `${ctx.userId}/${petId}/${documentId}/${randomUUID()}`,
    ...file,
  }))

  // Grants cost no row: a failure here leaves nothing behind.
  let uploads: DocumentGrant['uploads']
  try {
    uploads = await Promise.all(
      planned.map(async (file) => {
        const grant = await ctx.storage.grantWrite(file.path, file.content_type)
        return { file_id: file.id, url: grant.url, method: 'PUT' as const, headers: grant.headers, expires_at: grant.expiresAt }
      }),
    )
  } catch {
    return fail('storage_error')
  }

  // One statement under the pet's row lock: the cap counts and inserts without a gap.
  const { data: created, error } = await ctx.supabase.rpc('create_pet_document', {
    p_user_id: ctx.userId,
    p_pet_id: petId,
    p_document_id: documentId,
    p_kind: input.kind,
    p_title: input.title ?? '',
    p_files: planned.map((file) => ({
      id: file.id,
      position: file.position,
      object_path: file.path,
      content_type: file.content_type,
      size_bytes: file.size_bytes,
    })),
  })
  if (error) return fail('storage_error')
  if (created === 'limit_reached') return fail('limit_reached')
  if (created === 'not_found') return fail('not_found')
  if (created !== 'ok') return fail('storage_error')

  return ok({ document_id: documentId, uploads })
}

/**
 * Checks the uploaded files and, if every one is what it was declared to be,
 * moves the document to `stored`. A bad file removes the document with its
 * objects. A file not uploaded yet leaves the document `pending` to be tried
 * again. A document already `stored` answers as it is: the phone may be
 * repeating a call whose answer it did not hear.
 */
export async function completeDocument(
  ctx: DocumentContext,
  petId: string,
  docId: string,
): Promise<DocumentResult<PetDocument>> {
  const doc = await ownDocument(ctx, petId, docId)
  if (!doc.ok) return doc
  if (doc.value.status === 'stored') return presentOne(ctx, doc.value)
  if (doc.value.status !== 'pending') return fail('wrong_status')
  // Past the grant's two hours the sweep may take it any minute: do not race it.
  if (Date.now() - Date.parse(doc.value.created_at) > COMPLETE_WITHIN_SECONDS * 1000) return fail('wrong_status')

  const files = await filesOf(ctx, [docId])
  if (!files.ok) return files

  const verified: { id: string; contentType: DocumentContentType; pageCount: number; size: number }[] = []
  for (const file of files.value) {
    let bytes: Uint8Array
    try {
      bytes = await ctx.storage.download(file.object_path)
    } catch {
      return fail('storage_error')
    }
    const verdict = await verifyDocumentFile(bytes, file.content_type)
    if (!verdict.ok) {
      await removeDocumentsOf(ctx, [docId])
      return fail(verdict.reason)
    }
    verified.push({ id: file.id, contentType: verdict.contentType, pageCount: verdict.pageCount, size: bytes.length })
  }

  const now = new Date().toISOString()
  for (const file of verified) {
    const { error } = await ctx.supabase
      .from('pet_document_files')
      .update({ content_type: file.contentType, page_count: file.pageCount, size_bytes: file.size, verified_at: now })
      .eq('id', file.id)
    if (error) return fail('storage_error')
  }

  const { data: stored, error } = await ctx.supabase
    .from('pet_documents')
    .update({ status: 'stored', updated_at: now })
    .eq('id', docId)
    .eq('user_id', ctx.userId)
    .eq('status', 'pending')
    .select(DOCUMENT_COLUMNS)
    .maybeSingle()
  if (error) return fail('storage_error')
  // Another call finished first, or the document went meanwhile.
  if (!stored) return readDocument(ctx, petId, docId)
  return presentOne(ctx, stored as DocumentRow)
}

/** The pet's documents, newest first; one still `pending` is an upload in progress and is not listed. */
export async function listDocuments(ctx: DocumentContext, petId: string): Promise<DocumentResult<DocumentList>> {
  const pet = await ownPet(ctx, petId)
  if (!pet.ok) return pet
  const { data, error } = await ctx.supabase
    .from('pet_documents')
    .select(DOCUMENT_COLUMNS)
    .eq('pet_id', petId)
    .eq('user_id', ctx.userId)
    .neq('status', 'pending')
    .order('created_at', { ascending: false })
    .order('id')
  if (error) return fail('storage_error')

  const documents = await present(ctx, (data ?? []) as DocumentRow[])
  if (!documents.ok) return documents
  // The counter arrives with recognition (DOC-2); until then every pet has all of them.
  return ok({ documents: documents.value, free_recognitions_left: FREE_RECOGNITIONS, recognition_price: 0 })
}

export async function readDocument(ctx: DocumentContext, petId: string, docId: string): Promise<DocumentResult<PetDocument>> {
  const doc = await ownDocument(ctx, petId, docId)
  return doc.ok ? presentOne(ctx, doc.value) : doc
}

/** Title, kind and date of a document whose files are checked. */
export async function patchDocument(
  ctx: DocumentContext,
  petId: string,
  docId: string,
  patch: DocumentPatch,
): Promise<DocumentResult<PetDocument>> {
  const doc = await ownDocument(ctx, petId, docId)
  if (!doc.ok) return doc
  if (doc.value.status === 'pending') return fail('wrong_status')

  const { data, error } = await ctx.supabase
    .from('pet_documents')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', docId)
    .eq('user_id', ctx.userId)
    .select(DOCUMENT_COLUMNS)
    .maybeSingle()
  if (error) return fail('storage_error')
  if (!data) return fail('not_found')
  return presentOne(ctx, data as DocumentRow)
}

/** Objects at once, then rows. The medical record's entries stay. A failed removal keeps the rows, so it can be repeated. */
export async function deleteDocument(ctx: DocumentContext, petId: string, docId: string): Promise<DocumentResult> {
  const doc = await ownDocument(ctx, petId, docId)
  if (!doc.ok) return doc

  const files = await filesOf(ctx, [docId])
  if (!files.ok) return files
  try {
    await ctx.storage.remove(files.value.map((file) => file.object_path))
  } catch {
    return fail('storage_error')
  }
  const { error } = await ctx.supabase.from('pet_documents').delete().eq('id', docId).eq('user_id', ctx.userId)
  return error ? fail('storage_error') : ok(undefined)
}

/**
 * A deleted pet's documents, as its photo goes (FB-4). The rows go even when an
 * object could not be removed — the sweep finds what no row points at — and the
 * failure is only reported.
 */
export async function removePetDocuments(ctx: DocumentContext, petId: string): Promise<DocumentResult> {
  const { data, error } = await ctx.supabase
    .from('pet_documents')
    .select('id')
    .eq('pet_id', petId)
    .eq('user_id', ctx.userId)
  if (error) return fail('storage_error')
  const clean = await removeDocumentsOf(ctx, (data ?? []).map((doc: { id: string }) => doc.id))
  return clean ? ok(undefined) : fail('storage_error')
}

/** Every object under one person's folder: account deletion's `photos` step. The rows go with the account's data. */
export async function removeUserDocuments(ctx: DocumentContext): Promise<DocumentResult> {
  try {
    await ctx.storage.removePrefix(ctx.userId)
  } catch {
    return fail('storage_error')
  }
  return ok(undefined)
}

/**
 * Uploads never completed, and objects no document points at. Throws on a
 * failure, as the avatar sweep: the cron answers 500 and tries again tomorrow.
 *
 * @returns how many documents and objects went.
 */
export async function sweepDocuments(deps: DocumentDeps, now: Date = new Date(), batch = 200): Promise<number> {
  const cutoff = new Date(now.getTime() - SWEEP_AFTER_SECONDS * 1000).toISOString()
  let removed = 0

  // A document still `pending` after the grant ran out will not be completed.
  for (let i = 0; i < 50; i++) {
    const { data, error } = await deps.supabase
      .from('pet_documents')
      .select('id')
      .eq('status', 'pending')
      .lt('created_at', cutoff)
      .order('created_at')
      .limit(batch)
    if (error) throw new Error('document sweep select failed')
    const ids = (data ?? []).map((doc: { id: string }) => doc.id)
    if (ids.length === 0) break

    const { data: files, error: filesError } = await deps.supabase
      .from('pet_document_files')
      .select('document_id, object_path')
      .in('document_id', ids)
    if (filesError) throw new Error('document sweep select failed')
    // Rows first, and only those still `pending`: one completed since the read stays, with its objects.
    const { data: gone, error: deleteError } = await deps.supabase
      .from('pet_documents')
      .delete()
      .in('id', ids)
      .eq('status', 'pending')
      .select('id')
    if (deleteError) throw new Error('document sweep delete failed')
    const goneIds = new Set((gone ?? []).map((doc: { id: string }) => doc.id))
    // A failure here leaves objects no row points at: the pass below finds them.
    await deps.storage.remove(
      (files ?? [])
        .filter((file: { document_id: string }) => goneIds.has(file.document_id))
        .map((file: { object_path: string }) => file.object_path),
    )
    removed += goneIds.size
    // Nothing went: the batch is all completed documents, and would come up again.
    if (goneIds.size === 0) break
  }

  for (let i = 0; i < 50; i++) {
    const { data, error } = await deps.supabase.rpc('stale_document_objects', { p_cutoff: cutoff, p_limit: batch })
    if (error) throw new Error('document sweep select failed')
    const names = (data ?? []) as string[]
    if (names.length === 0) break
    await deps.storage.remove(names)
    removed += names.length
  }
  return removed
}
