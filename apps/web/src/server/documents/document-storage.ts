import 'server-only'

import { DOCUMENT_LIMITS } from '@lapka/contracts'
import type { createServiceClient } from '@/server/supabase/server'

type SupabaseService = ReturnType<typeof createServiceClient>

/**
 * Where a pet document's files live (DOC-1). The rest of the documents code
 * knows only this interface: moving the files elsewhere is a second
 * implementation of it plus a copy of the objects, and the apps do not change,
 * because they PUT to the address and headers a grant names.
 */
export type DocumentStorage = {
  /** Where, and how, the phone writes one new object: it cannot replace one. */
  grantWrite(path: string, contentType: string): Promise<{ url: string; headers: Record<string, string>; expiresAt: string }>
  /** The object's bytes. Throws when it is not there or Storage did not answer. */
  download(path: string): Promise<Uint8Array>
  /** Read links, in the order given; null where one could not be made. */
  signRead(paths: string[], seconds: number): Promise<(string | null)[]>
  /** Throws when Storage refuses. A path that is not there is not an error. */
  remove(paths: string[]): Promise<void>
  /** Every object under the prefix, at any depth. Throws when Storage refuses. */
  removePrefix(prefix: string): Promise<void>
}

export const DOCUMENT_BUCKET = 'pet-documents'

/** How many names one list or remove call carries. */
const PAGE = 100

export function supabaseDocumentStorage(supabase: SupabaseService): DocumentStorage {
  const bucket = () => supabase.storage.from(DOCUMENT_BUCKET)

  /** Every file path under `prefix`: a folder has no id, a file has one. */
  async function filesUnder(prefix: string): Promise<string[]> {
    const found: string[] = []
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await bucket().list(prefix, { limit: PAGE, offset })
      if (error) throw new Error('document list failed')
      for (const entry of data ?? []) {
        const path = `${prefix}/${entry.name}`
        if (entry.id) found.push(path)
        else found.push(...(await filesUnder(path)))
      }
      if (!data || data.length < PAGE) return found
    }
  }

  async function remove(paths: string[]): Promise<void> {
    for (let i = 0; i < paths.length; i += PAGE) {
      const { error } = await bucket().remove(paths.slice(i, i + PAGE))
      if (error) throw new Error('document remove failed')
    }
  }

  return {
    async grantWrite(path, contentType) {
      const { data, error } = await bucket().createSignedUploadUrl(path, { upsert: false })
      if (error || !data) throw new Error('document grant failed')
      return {
        url: data.signedUrl,
        headers: { 'content-type': contentType, 'x-upsert': 'false' },
        // The apps' window to finish an upload; the URL itself outlives it (Storage keeps it two hours).
        expiresAt: new Date(Date.now() + DOCUMENT_LIMITS.grantSeconds * 1000).toISOString(),
      }
    },

    async download(path) {
      const { data, error } = await bucket().download(path)
      if (error || !data) throw new Error('document download failed')
      return new Uint8Array(await data.arrayBuffer())
    },

    async signRead(paths, seconds) {
      if (paths.length === 0) return []
      const { data, error } = await bucket().createSignedUrls(paths, seconds)
      if (error || !data) return paths.map(() => null)
      const byPath = new Map(data.map((entry) => [entry.path, entry.signedUrl ?? null]))
      return paths.map((path) => byPath.get(path) ?? null)
    },

    remove,

    async removePrefix(prefix) {
      await remove(await filesUnder(prefix.replace(/\/+$/, '')))
    },
  }
}
