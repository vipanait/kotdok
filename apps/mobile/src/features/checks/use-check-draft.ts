import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { draftStorage } from '@/lib/supabase'
import { DRAFT_KEY, parseDraft, serialiseDraft, shouldKeepDraft, type CheckDraft } from './check-draft'
import { emptyCheckForm, type CheckForm } from './check-form'

/**
 * The check form and the step it is on, kept across a restart (`check-draft`).
 *
 * The draft is read once and written back at the moments a phone can take the
 * app away: leaving the screen (`keepDraft`, from the screen's focus effect),
 * and going to the background. Writing on every keystroke would put the
 * keychain in the typing path for no gain.
 */
export function useCheckDraft(userId: string | null) {
  const [form, setForm] = useState<CheckForm>(emptyCheckForm())
  const [step, setStep] = useState<1 | 2>(1)

  const latest = useRef<CheckDraft>({ form, step })
  latest.current = { form, step }

  /**
   * Whether this question is done with — sent, or abandoned by pressing Cancel.
   *
   * Anything else that takes somebody off this screen is an interruption, and
   * the draft is here for those: describing symptoms is work, and losing it to
   * a mistyped tap is not forgiven.
   */
  const finished = useRef(false)

  const keepDraft = useCallback(async () => {
    if (!userId) return

    const { form: current, step: at } = latest.current

    if (!shouldKeepDraft({ finished: finished.current, form: current })) {
      await draftStorage.removeItem(DRAFT_KEY)
      return
    }
    await draftStorage.setItem(DRAFT_KEY, serialiseDraft(userId, { form: current, step: at }))
  }, [userId])

  const forgetDraft = useCallback(async () => {
    await draftStorage.removeItem(DRAFT_KEY)
  }, [])

  // Restored once per account. A draft belonging to whoever used the phone
  // before is refused inside `parseDraft`, not here.
  const restored = useRef(false)
  useEffect(() => {
    if (!userId || restored.current) return
    restored.current = true

    void draftStorage.getItem(DRAFT_KEY).then((raw) => {
      const draft = parseDraft(raw, userId)
      if (!draft) return
      setForm(draft.form)
      setStep(draft.step)
    })
  }, [userId])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void keepDraft()
    })
    return () => subscription.remove()
  }, [keepDraft])

  return { form, setForm, step, setStep, finished, keepDraft, forgetDraft }
}
