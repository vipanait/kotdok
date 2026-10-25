import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import type { Pet } from '@lapka/contracts'
import { summaryRecords } from '@lapka/shared'
import { withFreshSession } from '@/lib/api'
import { localToday } from '@/lib/calendar-day'
import { useCacheReader } from '@/lib/query-cache'
import { queryKeys } from '@/lib/query-keys'
import type { CheckForm } from './check-form'

/**
 * Which animal the check is about.
 *
 * The check is about one animal; starting on the first one saves a tap for
 * the many people who own exactly one. A draft can name a pet that has since
 * been deleted, on this phone or another: falling back to the first keeps the
 * form usable instead of failing at the very end. Also whenever the form
 * loses its pet: an emptied form (after a finished check or «Начать заново»)
 * gets the first one again, even when the cached list it is chosen from has
 * not changed.
 *
 * A pet named by the screen that opened the form — one pet's empty history —
 * is the one chosen, once the list confirms it is still there. The parameter
 * is then dropped, so it does not win over a later choice in the form.
 */
export function usePetChoice(
  pets: Pet[] | null,
  petId: string | null,
  setForm: Dispatch<SetStateAction<CheckForm>>,
  setStep: Dispatch<SetStateAction<1 | 2>>,
) {
  // A draft whose animal is gone goes back to the first step: its description
  // was written about someone else, and the second step showed it only as a
  // line under the new name (a check refused for the balance, Tom deleted, Rex
  // added — Rex opened on step 2 with Tom's symptoms).
  useEffect(() => {
    if (!pets) return
    const stillThere = pets.some((pet) => pet.id === petId)
    if (stillThere || pets.length === 0) return
    if (petId !== null) setStep(1)
    setForm((current) => ({ ...current, petId: pets[0].id }))
  }, [pets, petId, setForm, setStep])

  const { petId: askedPet } = useLocalSearchParams<{ petId?: string }>()
  useEffect(() => {
    if (!askedPet || !pets?.some((pet) => pet.id === askedPet)) return
    setForm((current) => ({ ...current, petId: askedPet }))
    router.setParams({ petId: undefined })
  }, [askedPet, pets, setForm])
}

/**
 * «Учтём медкарту»: the pet whose record has something in it, by the rule the
 * server includes the record by — read again whenever the screen comes back
 * (a record may have been added). Unknown is no.
 */
export function useRecordCaption(petId: string | null): string | null {
  const read = useCacheReader()
  const [withRecord, setWithRecord] = useState<string | null>(null)
  useFocusEffect(
    useCallback(() => {
      if (!petId) return
      let current = true
      const today = localToday()
      read(queryKeys.summary(petId, today), () => withFreshSession((api) => api.getVetSummary(petId, today)))
        .then((summary) => {
          if (current) setWithRecord(summaryRecords(summary) > 0 ? petId : null)
        })
        .catch(() => {
          if (current) setWithRecord(null)
        })
      return () => {
        current = false
      }
    }, [petId, read]),
  )
  return withRecord
}
