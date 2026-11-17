'use client'

import { useTranslations } from '@/components/LocaleProvider'
import ConfirmDialog from '@/features/pets/ConfirmDialog'

/**
 * «Не добавлять записи?» (DOC-2 `DELETE …/recognition`): the draft goes, the
 * file stays, and recognising again is charged again — a free use or a
 * check (spec «Кредиты»). The safe answer, back to the review, has focus.
 */
export default function DiscardConfirm({
  busy,
  error,
  onCancel,
  onConfirm,
  returnFocusRef,
}: {
  busy: boolean
  error?: string
  onCancel: () => void
  onConfirm: () => void
  returnFocusRef?: React.RefObject<HTMLElement | null>
}) {
  const words = useTranslations().documents.recognition.discard
  return (
    <ConfirmDialog
      title={words.title}
      body={words.body}
      cancelLabel={words.stay}
      confirmLabel={words.confirm}
      busyLabel={words.busy}
      busy={busy}
      error={error}
      tone="danger"
      className="document-confirm"
      onCancel={onCancel}
      onConfirm={onConfirm}
      returnFocusRef={returnFocusRef}
    />
  )
}
