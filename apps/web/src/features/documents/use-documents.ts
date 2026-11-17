'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { DocumentList, PetDocument } from '@lapka/contracts'
import { initialRecordState, loadStep, recordReducer, type RecordState } from '@/features/medical-record/record-load'
import { browserApi } from '@/features/api/browser-api'

/**
 * One read of the documents API in the record's load states: a skeleton, an
 * error with a retry instead of an empty list, nothing for a pet (or a
 * document) that is not the caller's. Never cached: the read links inside
 * expire within the hour.
 */
function useDocumentLoad<T>(read: () => Promise<T>, petId: string, label: string): { state: RecordState<T>; reload: () => void; refresh: () => void } {
  const [state, dispatch] = useReducer(recordReducer<T>, null, initialRecordState<T>)
  const latest = useRef(0)
  const readRef = useRef(read)
  useEffect(() => {
    readRef.current = read
  }, [read])

  const run = useCallback(async () => {
    const request = ++latest.current
    const action = await loadStep(() => readRef.current(), petId, () => request === latest.current, { label })
    if (action) dispatch(action)
  }, [petId, label])

  useEffect(() => {
    void run()
    return () => {
      latest.current += 1
    }
  }, [run])

  const reload = useCallback(() => {
    dispatch({ type: 'start' })
    void run()
  }, [run])

  return { state, reload, refresh: run }
}

export function useDocumentList(petId: string) {
  const read = useCallback(() => browserApi().listDocuments(petId), [petId])
  return useDocumentLoad<DocumentList>(read, petId, 'documents')
}

export function useDocument(petId: string, docId: string) {
  const read = useCallback(() => browserApi().getDocument(petId, docId), [petId, docId])
  return useDocumentLoad<PetDocument>(read, petId, 'document')
}
