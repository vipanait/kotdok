import { useCallback, useEffect, useState } from 'react'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
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
import { prefillDecision } from '@/features/checks/check-draft'
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
import { ConfirmDialog } from '@/ui/Dialog'
import { Screen } from '@/ui/Screen'
import { FormSkeleton } from '@/ui/Skeleton'

/** A description begun elsewhere, and the pet it is about (when it still exists). */
type HandedOver = { text: string; petId: string | null }

/**
 * The symptom check in two steps. The draft and the send live in hooks; this
 * screen ties them to the tab's comings and goings and draws the step.
 */
export default function NewCheck() {
  const t = useText()
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const { form, setForm, step, setStep, finished, keepDraft, forgetDraft, draftRead } = useCheckDraft(userId)
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

  /**
   * «Проверить симптомы» on a «Можно ли?» card: the pet and «Съел(а): …».
   *
   * Taken once the stored draft has been read and the pets are known, and the
   * parameters dropped at once, so coming back to the tab does not hand the
   * text over again. Decided a render later, against the form as it stands
   * after anything this focus emptied. A draft somebody began is replaced
   * only when they say so.
   */
  const { prefill, petId: prefillPet } = useLocalSearchParams<{ prefill?: string; petId?: string }>()
  const [handed, setHanded] = useState<HandedOver | null>(null)
  const [replacing, setReplacing] = useState<HandedOver | null>(null)
  useEffect(() => {
    if (!prefill || !draftRead || !pets) return
    setHanded({ text: prefill, petId: prefillPet && pets.some((pet) => pet.id === prefillPet) ? prefillPet : null })
    router.setParams({ prefill: undefined, petId: undefined })
  }, [prefill, prefillPet, draftRead, pets])

  const applyHandOver = useCallback(
    (given: HandedOver, replace: boolean) => {
      // A check already sent is done with: empty the screen as its next focus would.
      if (replace || finished.current) startFresh()
      setForm((current) => ({
        ...current,
        petId: given.petId ?? current.petId,
        symptoms: current.symptoms.startsWith(given.text) ? current.symptoms : given.text,
      }))
    },
    [finished, setForm, startFresh],
  )

  useEffect(() => {
    if (!handed) return
    setHanded(null)
    const decision = prefillDecision(finished.current ? emptyCheckForm() : form, handed.text)
    if (decision === 'apply') applyHandOver(handed, false)
    else if (decision === 'ask') setReplacing(handed)
    // The form is read as it is now, once per hand-over; its later edits are not a reason to decide again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handed])

  const replaceDialog = (
    <ConfirmDialog
      visible={replacing !== null}
      title={t.safety.replaceTitle}
      message={t.safety.replaceBody}
      confirmTitle={t.safety.replace}
      cancelTitle={t.safety.keep}
      confirmKind="primary"
      onConfirm={() => {
        if (replacing) applyHandOver(replacing, true)
        setReplacing(null)
      }}
      onCancel={() => setReplacing(null)}
    />
  )

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
        {replaceDialog}
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
      {replaceDialog}
    </Screen>
  )
}
