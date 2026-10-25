import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import { withFreshSession } from '@/lib/api'
import type { Dictionary } from '@/i18n'
import { localDay } from '@/features/followup/followup-ui'
import type { RecheckRequest } from '@/features/followup/recheck-request'
import type { CheckForm } from './check-form'

export type Recheck = { caseId: string; petId: string; date: string; answers: number }

/**
 * A re-check «с учётом прошлой» (follow-up loop): asked for from a case's
 * outcome (`takeRecheck`, on the screen's way in), it carries the case, and the
 * analysis reads its previous check and answers. Only while that case's pet
 * is the one chosen (`recheckFor`); «Не учитывать» drops it. It costs a check
 * like any other.
 */
export function useRecheck(
  t: Dictionary,
  petId: string | null,
  setForm: Dispatch<SetStateAction<CheckForm>>,
  setStep: Dispatch<SetStateAction<1 | 2>>,
) {
  const [recheck, setRecheck] = useState<Recheck | null>(null)
  const openRecheck = useCallback(
    ({ caseId, petId }: RecheckRequest) => {
      // The case's plaque lives on the first step; a form left on the second
      // would send the previous description about it unseen.
      setStep(1)
      setForm((current) => ({ ...current, petId }))
      void withFreshSession((api) => api.getFollowup(caseId))
        .then((theCase) =>
          setRecheck({
            caseId: theCase.id,
            petId: theCase.pet_id,
            date: t.day(localDay(new Date(theCase.checks.at(-1)?.created_at ?? theCase.origin_checked_at)), false),
            answers: theCase.checkins.length,
          }),
        )
        .catch(() => setRecheck(null))
    },
    [t, setForm, setStep],
  )
  const dropRecheck = useCallback(() => setRecheck(null), [])
  const recheckFor = recheck && recheck.petId === petId ? recheck : null
  return { recheckFor, openRecheck, dropRecheck }
}
