import { useCallback, useState } from 'react'
import { router, useFocusEffect } from 'expo-router'
import type { Pet } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { useCached } from '@/lib/query-cache'
import { queryKeys } from '@/lib/query-keys'
import { describeFailure } from '@/lib/errors'
import { useText } from '@/i18n'
import { useAuth } from '@/providers/AuthProvider'
import { pendingCheck, takeFinishedCheck } from '@/features/checks/pending-check'
import { emptyCheckForm, formToCheckInput, type CheckForm } from '@/features/checks/check-form'
import { addPhotos, type PickedPhoto } from '@/features/checks/photos'
import { pickPhotos } from '@/features/checks/pick-photos'
import { useCheckDraft } from '@/features/checks/use-check-draft'
import { useCheckSubmission, useLiftedRefusal } from '@/features/checks/use-check-submission'
import { usePetChoice, useRecordCaption } from '@/features/checks/use-check-pet'
import { useRecheck } from '@/features/checks/use-recheck'
import { useCheckSteps } from '@/features/checks/use-check-steps'
import { CheckDescribeStep } from '@/features/checks/CheckDescribeStep'
import { CheckDetailsStep } from '@/features/checks/CheckDetailsStep'
import { CheckNeedPet } from '@/features/checks/CheckNeedPet'
import { CheckWaiting } from '@/features/checks/CheckWaiting'
import { takeRecheck } from '@/features/followup/recheck-request'
import { Button } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Screen } from '@/ui/Screen'
import { FormSkeleton } from '@/ui/Skeleton'

/**
 * The symptom check in two steps. The draft and the send live in hooks; this
 * screen ties them to the tab's comings and goings and draws the step.
 */
export default function NewCheck() {
  const t = useText()
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const { form, setForm, step, setStep, finished, keepDraft, forgetDraft } = useCheckDraft(userId)
  // Not part of the draft: picked photos are cache files that may not survive
  // a restart, and the draft lives in the keychain, which is for small values.
  const [photos, setPhotos] = useState<PickedPhoto[]>([])
  const [symptomsError, setSymptomsError] = useState<string | null>(null)
  const { recheckFor, openRecheck, dropRecheck } = useRecheck(t, form.petId, setForm, setStep)
  const submission = useCheckSubmission({ t, userId, finished, forgetDraft, dropRecheck })
  const { waiting, failure, focused, watch, reset } = submission

  /** Empties the screen so the next check starts where a first one would. */
  const startFresh = useCallback(() => {
    finished.current = false
    reset()
    setForm(emptyCheckForm())
    setPhotos([])
    setStep(1)
    setSymptomsError(null)
  }, [finished, reset, setForm, setStep])

  // The pets through the cache shared with the pet list, refreshed on every
  // focus: the tab keeps this screen alive, so a person who adds their first
  // pet and comes back here must not still be told to add one.
  const petList = useCached(queryKeys.pets(), () => withFreshSession((api) => api.listPets()))
  const pets: Pet[] | null = petList.data
  // Deliberately not an empty list on failure: "add a pet first" would be a
  // lie when the pets exist and the network does not. With pets already in
  // hand, a failed refresh keeps the form.
  const petsError = petList.error && !pets ? describeFailure(t, petList.error, t.errors.loadPetsFailed) : null
  // The balance, through the profile's cache: an empty one is said on the first
  // step, before the form is filled in for a check that cannot be sent.
  const me = useCached(queryKeys.me(), () => withFreshSession((api) => api.getMe()))
  const balance = me.data
  usePetChoice(pets, form.petId, setForm, setStep)

  function change(patch: Partial<CheckForm>) {
    setForm((current) => ({ ...current, ...patch }))
    // Retired by editing the description, the one field it is about: a red
    // «хотя бы 3 символа» under a paragraph reads as the paragraph being wrong.
    if ('symptoms' in patch) setSymptomsError(null)
  }

  useFocusEffect(
    useCallback(() => {
      focused.current = true
      // On the way in, not on the way out: clearing on the way out would empty
      // the fields while they are still on screen, in the moment the result is
      // being opened.
      if (finished.current) startFresh()
      // After the emptying, or it would undo the pet the re-check is about.
      const asked = takeRecheck()
      if (asked) openRecheck(asked)

      const done = takeFinishedCheck(userId)
      if (done) {
        router.push({ pathname: '/check/[id]', params: { id: done, fresh: '1' } })
      } else {
        const job = pendingCheck(userId)
        if (job) void watch(job)
      }

      return () => {
        focused.current = false
        void keepDraft()
      }
    }, [focused, finished, keepDraft, openRecheck, startFresh, userId, watch]),
  )

  useLiftedRefusal(submission, me.reload)
  const { from, goTo } = useCheckSteps(step, setStep)

  function next() {
    const input = formToCheckInput(t, form)
    if (!input.ok) {
      setSymptomsError(input.message)
      return
    }
    setSymptomsError(null)
    goTo(2)
  }

  async function submit() {
    const checked = formToCheckInput(t, form)
    if (!checked.ok) {
      setSymptomsError(checked.message)
      goTo(1)
      return
    }
    await submission.submit(checked.value, photos, recheckFor?.caseId ?? null)
  }

  // Before any early return: hooks run in the same order on every render.
  const withRecord = useRecordCaption(form.petId)

  if (waiting || failure) {
    return <CheckWaiting failure={failure} onRetry={() => void submit()} />
  }

  if (petsError) {
    return (
      <Screen title={t.check.title}>
        <Banner text={petsError.text} tone="error" icon={petsError.offline ? 'wifi' : 'alert'} />
        <Button title={t.common.retry} kind="secondary" onPress={() => void petList.reload()} />
      </Screen>
    )
  }

  if (pets === null) {
    return (
      <Screen title={t.check.title}>
        <FormSkeleton fields={3} />
      </Screen>
    )
  }

  if (pets.length === 0) {
    return (
      <Screen title={t.check.title} scroll centered>
        <CheckNeedPet />
      </Screen>
    )
  }

  // One `Screen` across both steps, as the steps slide in and out under it.
  if (step === 1) {
    // Only the way on in the dock. This is a tab: the tab bar is the way out, and leaving keeps the draft.
    return (
      <Screen title={t.check.title} scroll dock={<Button title={t.common.next} onPress={next} />}>
        <CheckDescribeStep
          pets={pets}
          form={form}
          photos={photos}
          from={from}
          withRecord={withRecord !== null && withRecord === form.petId}
          noChecks={balance?.credits === 0 ? { canRequest: balance.capabilities.extra_check_request } : null}
          recheck={recheckFor}
          symptomsError={symptomsError}
          onChange={change}
          onDropRecheck={dropRecheck}
          onAddPhotos={(source) =>
            void pickPhotos(source, photos.length).then((picked) => {
              if (picked) setPhotos((current) => addPhotos(current, picked))
            })
          }
          onRemovePhoto={(index) => setPhotos((current) => current.filter((_, i) => i !== index))}
        />
      </Screen>
    )
  }

  return (
    <Screen
      title={t.check.title}
      // Back to the description in the header, as on every other screen: the
      // dock keeps one action and the form gets the room.
      onBack={() => goTo(1)}
      scroll
      dock={<Button title={t.check.submit} onPress={() => void submit()} />}
    >
      <CheckDetailsStep
        petName={pets.find((pet) => pet.id === form.petId)?.name ?? null}
        form={form}
        photoCount={photos.length}
        from={from}
        onChange={change}
        onBack={() => goTo(1)}
      />
    </Screen>
  )
}
