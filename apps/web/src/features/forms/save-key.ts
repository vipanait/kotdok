'use client'

import { useState } from 'react'

/**
 * The Idempotency-Key of one logical save (docs/plans/medical-record-web,
 * «Общие правила»): every retry of that save — a second press, a retry after
 * «нет связи», a retry after a lost answer — carries the same key, so the
 * server keeps one record however many requests reach it. A new logical save
 * gets a new key: `renew()` once a save has succeeded and the form could be
 * used again.
 *
 * One key per form, not per body: if an earlier try did land and the owner
 * changed the fields since, the server answers 409 (same key, other data)
 * instead of storing a second record, and the form says the record was
 * already saved. That is the phone's rule too (event-form.tsx, `requestKey`).
 */
export type SaveKey = { readonly current: () => string; readonly renew: () => void }

export function createSaveKey(newKey: () => string = () => crypto.randomUUID()): SaveKey {
  let key = newKey()
  return {
    current: () => key,
    renew: () => {
      key = newKey()
    },
  }
}

/** The form's save key: made once when the form mounts, the same across renders. */
export function useSaveKey(): SaveKey {
  const [key] = useState(() => createSaveKey())
  return key
}
