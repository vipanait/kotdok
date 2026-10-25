import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { AppState } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import type { CheckCreateInput } from '@lapka/contracts'
import { ApiError } from '@lapka/shared'
import { withFreshSession } from '@/lib/api'
import { localToday } from '@/lib/calendar-day'
import { AppError, errorMessage, failureKind, submitCheckMessage } from '@/lib/errors'
import { preparePhoto, putPhoto } from '@/lib/photo-io'
import { useInvalidate } from '@/lib/query-cache'
import { queryKeys } from '@/lib/query-keys'
import type { Dictionary } from '@/i18n'
import { afterFailedSend, newIdempotencyKey, refusalLifted } from './check-form'
import { GIVE_UP_AFTER_MS, POLL_EVERY_MS, jobStep } from './check-job'
import { forgetPendingCheck, rememberFinishedCheck, rememberPendingCheck } from './pending-check'
import { uploadPhotos } from './photo-upload'
import type { PickedPhoto } from './photos'

export type CheckFailure = { text: string; kind: AppError['kind'] | null }

/**
 * Sending a check and waiting for its answer: the idempotency key and the
 * photos already uploaded under it, the request, and the loop asking whether
 * the analysis is done.
 *
 * The key and the uploads outlive a failed send on purpose — a retry after a
 * lost answer must be recognised as the same request, not charged twice
 * (`afterFailedSend`). `reset` lets go of both for the next check.
 */
export function useCheckSubmission({
  t,
  userId,
  finished,
  forgetDraft,
  dropRecheck,
}: {
  t: Dictionary
  userId: string | null
  /** Set once a check is sent and charged: the screen empties itself on the way back in. */
  finished: RefObject<boolean>
  forgetDraft: () => Promise<void>
  /** A sent re-check is done with, and one the case refused is dropped. */
  dropRecheck: () => void
}) {
  const [failure, setFailure] = useState<CheckFailure | null>(null)
  const [waiting, setWaiting] = useState(false)
  const invalidate = useInvalidate()

  // Kept across renders so a retry after a lost answer reuses the same key and
  // is not charged a second time.
  const key = useRef<string | null>(null)

  // Photos already in storage for this key. A retry after a lost answer sends
  // the same ids again, so the server can recognise the request it already took.
  const uploaded = useRef<{ key: string; photos: PickedPhoto[]; ids: string[] } | null>(null)

  /** Whether this tab is the one in front, which is not the same as mounted. Set by the screen's focus effect. */
  const focused = useRef(false)

  /**
   * Whether this screen still exists.
   *
   * Leaving the tab takes it apart, and the loop asking whether the answer has
   * arrived goes with it. Nothing may be shown after that: the state it would
   * set belongs to a screen that is gone. What was being waited for is in
   * `pending-check`, and the wait resumes on the way back in.
   */
  const onScreen = useRef(true)
  useEffect(
    () => () => {
      onScreen.current = false
    },
    [],
  )

  /** Lets go of the last check: its key, its uploads, its failure and its wait. */
  const reset = useCallback(() => {
    key.current = null
    uploaded.current = null
    setFailure(null)
    setWaiting(false)
  }, [])

  const waitForResult = useCallback(async (jobId: string) => {
    const deadline = Date.now() + GIVE_UP_AFTER_MS

    while (Date.now() < deadline) {
      const step = jobStep(await withFreshSession((api) => api.getCheckJob(jobId)))
      // The screen is gone; the job is remembered and the wait picks up again
      // when this tab is next opened.
      if (!onScreen.current) return

      if (step.kind === 'ready') {
        // Pushed, not replaced. Replacing put the result *in place of* the
        // form, so the tab had nothing else in it: coming back to «Проверка»
        // reopened last week's answer and there was no way to start another
        // check from here at all. Pushed, the form stays underneath — back and
        // the tab bar both return to it, and it empties itself on the way in.
        //
        // Only while this tab is in front. A person who was told they could
        // leave must not be pulled out of wherever they went; the answer waits
        // for them here.
        if (focused.current) {
          forgetPendingCheck()
          // `fresh`: just answered, so the result may ask for a rating (store-review).
          router.push({ pathname: '/check/[id]', params: { id: step.checkId, fresh: '1' } })
        } else if (userId) {
          rememberFinishedCheck(userId, step.checkId)
        }
        return
      }
      if (step.kind === 'failed') {
        // The key is spent. It names a question the server has already answered
        // — with a refusal — and reusing it would hand back that same refusal
        // for ever, even once the reason for it is gone. A lost answer is the
        // opposite case and deliberately keeps its key: there the job may well
        // have succeeded.
        key.current = null
        throw step.reason === 'insufficient_credits'
          ? new AppError(t.errors.insufficientCredits, 'insufficient_credits')
          : new AppError(t.errors.analysisFailed, 'analysis_failed')
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_EVERY_MS))
      if (!onScreen.current) return
    }

    // The work is still going; the answer will be in the history when it lands.
    throw new AppError(t.errors.analysisSlow, 'still_running')
  }, [t, userId])

  /**
   * Waiting for an answer, however that wait started — sending the check, or
   * coming back to this tab while one is still running.
   */
  const watch = useCallback(
    async (jobId: string) => {
      setWaiting(true)
      setFailure(null)
      try {
        await waitForResult(jobId)
      } catch (cause) {
        // Whatever went wrong, it is no longer worth waiting for: a failed job
        // answers the same way for ever, and a slow one is in the history.
        forgetPendingCheck()
        if (!onScreen.current) return
        setFailure({
          text: errorMessage(t, cause, t.errors.submitCheckFailed),
          kind: failureKind(cause),
        })
        setWaiting(false)
      }
    },
    [t, waitForResult],
  )

  /**
   * Sends a check the form has already read (`formToCheckInput`), with its
   * photos and — for a re-check — the case it continues, then waits for it.
   */
  async function submit(input: CheckCreateInput, photos: PickedPhoto[], recheckCaseId: string | null) {
    key.current ??= newIdempotencyKey()
    setWaiting(true)
    setFailure(null)
    let jobId: string
    try {
      const sameUpload =
        uploaded.current?.key === key.current && uploaded.current.photos === photos
      if (photos.length > 0 && !sameUpload) {
        const ids = await withFreshSession((api) =>
          uploadPhotos(
            { prepare: preparePhoto, requestUploads: api.requestUploads, put: putPhoto },
            photos,
          ),
        )
        uploaded.current = { key: key.current, photos, ids }
      }
      const body = {
        ...input,
        upload_ids: photos.length > 0 ? uploaded.current!.ids : [],
        ...(recheckCaseId !== null ? { followup_case_id: recheckCaseId } : {}),
      }
      const accepted = await withFreshSession((api) => api.createCheck(key.current!, body, localToday()))
      jobId = accepted.job_id
      // Charged and in the histories: the balance, the lists and the cases read again.
      void invalidate([queryKeys.me(), queryKeys.allChecks(), queryKeys.followups()])
      // Sent and charged: keeping it now would offer to send it a second time.
      finished.current = true
      dropRecheck()
      if (userId) rememberPendingCheck(userId, jobId)
      await forgetDraft()
    } catch (cause) {
      const next = afterFailedSend(cause)
      if (!next.keepKey) key.current = null
      if (!next.keepUploads) uploaded.current = null
      if (!onScreen.current) return
      // The case can no longer take a re-check (another pet, closed too long
      // ago): nothing was charged. The link is dropped, so the next send goes
      // as a new check — said so, instead of refusing the same way again.
      const caseRefused = recheckCaseId !== null && cause instanceof ApiError && cause.code === 'conflict'
      if (caseRefused) dropRecheck()
      setFailure({
        text: caseRefused ? t.followup.recheckRefused : submitCheckMessage(t, cause, photos.length > 0),
        kind: failureKind(cause),
      })
      setWaiting(false)
      return
    }

    await watch(jobId)
  }

  return { waiting, failure, setFailure, focused, onScreen, reset, watch, submit }
}

/**
 * A refusal for the balance waits for an extra check, which is granted by
 * hand, minutes or hours later. Nothing else takes the refusal down: it
 * stayed on screen with the check already on the balance until the app was
 * restarted. So the balance is asked again on the way back — to the tab, or
 * to the app from the background, which does not refocus the tab — and a
 * check on it puts the form back, still filled in.
 */
export function useLiftedRefusal(
  submission: Pick<ReturnType<typeof useCheckSubmission>, 'failure' | 'setFailure' | 'onScreen'>,
  reloadBalance: () => Promise<{ isSuccess: boolean; data?: { credits: number } }>,
) {
  const { failure, setFailure, onScreen } = submission
  const shortOfChecks = failure?.kind === 'insufficient_credits'
  useFocusEffect(
    useCallback(() => {
      if (!shortOfChecks) return
      let current = true
      const recheck = () =>
        void reloadBalance().then((refresh) => {
          if (current && onScreen.current && refusalLifted(refresh)) setFailure(null)
        })
      recheck()
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') recheck()
      })
      return () => {
        current = false
        subscription.remove()
      }
    }, [shortOfChecks, reloadBalance, setFailure, onScreen]),
  )
}
