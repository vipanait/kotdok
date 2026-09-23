import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  Image,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import {
  ACTIVITY_VALUES,
  APPETITE_VALUES,
  DURATION_VALUES,
  PAIN_SIGNS,
  PHOTO_LIMITS,
  STOOL_VALUES,
  type Pet,
} from '@lapka/contracts'
import { ApiError } from '@lapka/shared'
import { withFreshSession } from '@/lib/api'
import { AppError, describeFailure, errorMessage, submitCheckMessage } from '@/lib/errors'
import { preparePhoto, putPhoto } from '@/lib/photo-io'
import { useText, type Dictionary } from '@/i18n'
import { useAuth } from '@/providers/AuthProvider'
import { draftStorage } from '@/lib/supabase'
import {
  DRAFT_KEY,
  shouldKeepDraft,
  parseDraft,
  serialiseDraft,
  type CheckDraft,
} from '@/features/checks/check-draft'
import {
  forgetPendingCheck,
  pendingCheck,
  rememberFinishedCheck,
  rememberPendingCheck,
  takeFinishedCheck,
} from '@/features/checks/pending-check'
import {
  emptyCheckForm,
  formToCheckInput,
  newIdempotencyKey,
  toggleSign,
  type CheckForm,
} from '@/features/checks/check-form'
import { addPhotos, type PickedPhoto } from '@/features/checks/photos'
import { uploadPhotos } from '@/features/checks/photo-upload'
import { Button, LinkButton } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Chips, Field, Segment, Select } from '@/ui/Field'
import { PhotoStrip } from '@/ui/PhotoStrip'
import { Screen } from '@/ui/Screen'
import { Steps, SummaryCard } from '@/ui/Section'
import { Text } from '@/ui/Text'
import { colour, space } from '@/ui/theme'

/** How often to ask, and for how long before saying so. */
const POLL_EVERY_MS = 1500
const GIVE_UP_AFTER_MS = 3 * 60 * 1000

export default function NewCheck() {
  const t = useText()
  // The illustration is the first thing to give ground on a small screen: the
  // heading and the button below it are what the screen is for. 360 is the
  // width the concept's narrow artboard is drawn at.
  const narrow = useWindowDimensions().width <= 360
  const [form, setForm] = useState<CheckForm>(emptyCheckForm())
  // Not part of the draft: picked photos are cache files that may not survive
  // a restart, and the draft lives in the keychain, which is for small values.
  const [photos, setPhotos] = useState<PickedPhoto[]>([])
  const [pets, setPets] = useState<Pet[] | null>(null)
  const [petsError, setPetsError] = useState<{ text: string; offline: boolean } | null>(null)
  const [step, setStep] = useState<1 | 2>(1)
  const [symptomsError, setSymptomsError] = useState<string | null>(null)
  const [failure, setFailure] = useState<{ text: string; kind: AppError['kind'] | null } | null>(
    null,
  )
  const [waiting, setWaiting] = useState(false)
  const { session } = useAuth()
  const userId = session?.user.id ?? null

  /**
   * The draft, read once and written back at the moments a phone can take the
   * app away: leaving the screen, and going to the background. Writing on every
   * keystroke would put the keychain in the typing path for no gain.
   */
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

  // Kept across renders so a retry after a lost answer reuses the same key and
  // is not charged a second time.
  const key = useRef<string | null>(null)

  // Photos already in storage for this key. A retry after a lost answer sends
  // the same ids again, so the server can recognise the request it already took.
  const uploaded = useRef<{ key: string; photos: PickedPhoto[]; ids: string[] } | null>(null)

  /** Empties the screen so the next check starts where a first one would. */
  const startFresh = useCallback(() => {
    finished.current = false
    key.current = null
    uploaded.current = null
    setForm(emptyCheckForm())
    setPhotos([])
    setStep(1)
    setSymptomsError(null)
    setFailure(null)
    setWaiting(false)
  }, [])

  /** Whether this tab is the one in front, which is not the same as mounted. */
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

  const loadPets = useCallback(async () => {
    setPetsError(null)
    try {
      const list = await withFreshSession((api) => api.listPets())
      setPets(list)
      // The check is about one animal; starting on the first one saves a tap
      // for the many people who own exactly one.
      setForm((current) => {
        // A draft can name a pet that has since been deleted, on this phone or
        // another. Falling back to the first keeps the form usable instead of
        // failing at the very end on a pet the server no longer knows.
        const stillThere = list.some((pet) => pet.id === current.petId)
        if (stillThere || list.length === 0) return current
        return { ...current, petId: list[0].id }
      })
    } catch (cause) {
      // Deliberately not an empty list: "add a pet first" would be a lie when
      // the pets exist and the network does not.
      setPetsError(describeFailure(t, cause, t.errors.loadPetsFailed))
    }
  }, [t])

  // On focus rather than on mount. The tab keeps this screen alive, so a person
  // who adds their first pet and comes back here would otherwise still be told
  // to add one — and a failed load would stay failed until the app restarted.
  useFocusEffect(
    useCallback(() => {
      void loadPets()
    }, [loadPets]),
  )

  function change(patch: Partial<CheckForm>) {
    setForm((current) => ({ ...current, ...patch }))
    // Retired by editing the description, the one field it is about: a red
    // «хотя бы 3 символа» under a paragraph reads as the paragraph being wrong.
    if ('symptoms' in patch) setSymptomsError(null)
  }

  const waitForResult = useCallback(async (jobId: string) => {
    const deadline = Date.now() + GIVE_UP_AFTER_MS

    while (Date.now() < deadline) {
      const job = await withFreshSession((api) => api.getCheckJob(jobId))
      // The screen is gone; the job is remembered and the wait picks up again
      // when this tab is next opened.
      if (!onScreen.current) return

      if (job.status === 'completed' && job.check_id) {
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
          router.push(`/check/${job.check_id}`)
        } else if (userId) {
          rememberFinishedCheck(userId, job.check_id)
        }
        return
      }
      if (job.status === 'failed') {
        // The key is spent. It names a question the server has already answered
        // — with a refusal — and reusing it would hand back that same refusal
        // for ever, even once the reason for it is gone. A lost answer is the
        // opposite case and deliberately keeps its key: there the job may well
        // have succeeded.
        key.current = null
        throw job.error_code === 'insufficient_credits'
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
          kind: cause instanceof AppError ? cause.kind : null,
        })
        setWaiting(false)
      }
    },
    [t, waitForResult],
  )

  useFocusEffect(
    useCallback(() => {
      focused.current = true
      // On the way in, not on the way out: clearing on the way out would empty
      // the fields while they are still on screen, in the moment the result is
      // being opened.
      if (finished.current) startFresh()

      const done = takeFinishedCheck(userId)
      if (done) {
        router.push(`/check/${done}`)
      } else {
        const job = pendingCheck(userId)
        if (job) void watch(job)
      }

      return () => {
        focused.current = false
        void keepDraft()
      }
    }, [keepDraft, startFresh, userId, watch]),
  )

  /**
   * Cancel, and mean it.
   *
   * The one place somebody says this question is not worth keeping. Leaving any
   * other way keeps the draft, which is why this cannot simply navigate: the
   * screen saves what is in the fields on its way out.
   */
  function abandon() {
    finished.current = true
    void forgetDraft()
    router.replace('/pets')
  }

  function next() {
    const input = formToCheckInput(t, form)
    if (!input.ok) {
      setSymptomsError(input.message)
      return
    }
    setSymptomsError(null)
    setStep(2)
  }

  async function pickPhotos(source: 'camera' | 'library') {
    const left = PHOTO_LIMITS.maxFiles - photos.length
    if (left <= 0) return
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync()
    // A refusal is an answer, not an error: the check works without photos.
    if (!permission.granted) return
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: true,
            selectionLimit: left,
            quality: 1,
          })
    if (result.canceled) return
    setPhotos((current) =>
      addPhotos(
        current,
        result.assets.map(({ uri, width, height }) => ({ uri, width, height })),
      ),
    )
  }

  async function submit() {
    const checked = formToCheckInput(t, form)
    if (!checked.ok) {
      setSymptomsError(checked.message)
      setStep(1)
      return
    }

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
      const body = { ...checked.value, upload_ids: photos.length > 0 ? uploaded.current!.ids : [] }
      const accepted = await withFreshSession((api) => api.createCheck(key.current!, body))
      jobId = accepted.job_id
      // Sent and charged: keeping it now would offer to send it a second time.
      finished.current = true
      if (userId) rememberPendingCheck(userId, jobId)
      await forgetDraft()
    } catch (cause) {
      // The server answered, so these uploads were either used up or refused:
      // the next try uploads afresh. After a timeout nothing is known, and the
      // same ids let a repeat find the job the first attempt may have made.
      if (cause instanceof ApiError) uploaded.current = null
      if (!onScreen.current) return
      setFailure({
        text: submitCheckMessage(t, cause, photos.length > 0),
        kind: cause instanceof AppError ? cause.kind : null,
      })
      setWaiting(false)
      return
    }

    await watch(jobId)
  }

  if (waiting || failure) {
    return <Waiting t={t} failure={failure} onRetry={() => void submit()} />
  }

  if (petsError) {
    return (
      <Screen title={t.check.title}>
        <Banner
          text={petsError.text}
          tone="error"
          icon={petsError.offline ? 'wifi' : 'alert'}
        />
        <Button title={t.common.retry} kind="secondary" onPress={() => void loadPets()} />
      </Screen>
    )
  }

  if (pets === null) {
    return (
      <Screen title={t.check.title}>
        <ActivityIndicator color={colour.accent} />
      </Screen>
    )
  }

  /**
   * A check is about an animal, not about symptoms in the abstract.
   *
   * The analysis leans on species, age and chronic conditions; without a pet it
   * would answer in generalities and still cost a check from the balance. So
   * the form is not offered at all — the way out is to add the pet.
   */
  if (pets.length === 0) {
    return (
      <Screen title={t.check.title} scroll centered>
        {/* Decorative: the heading below already says what the screen is for,
            and a screen reader announcing two kittens helps nobody. */}
        <Image
          source={require('../../../assets/art/welcome-pets.png')}
          style={[styles.emptyArt, narrow ? styles.emptyArtNarrow : null]}
          resizeMode="contain"
          accessible={false}
        />
        <Text variant="h2" center style={styles.emptyTitle}>
          {t.check.needPetTitle}
        </Text>
        <Text tone="muted" center style={styles.emptyCopy}>
          {t.check.needPetBody}
        </Text>
        <Button title={t.pets.add} onPress={() => router.push('/pets/new')} />
      </Screen>
    )
  }

  const chosen = pets.find((pet) => pet.id === form.petId)

  if (step === 1) {
    return (
      <Screen
        title={t.check.title}
        scroll
        dock={
          <>
            <Button title={t.common.next} onPress={next} />
            <LinkButton title={t.common.cancel} onPress={abandon} />
          </>
        }
      >
        <Steps current={1} of={2} label={t.check.step} />

        {/* With several animals, a sheet rather than a row of names, which
            stops fitting as soon as somebody has a few. With one there is
            nothing to choose, so it is named instead. */}
        {pets.length > 1 ? (
          <Select
            label={t.check.pet}
            allowNone={false}
            options={pets.map((pet) => ({ value: pet.id, label: pet.name }))}
            value={form.petId}
            onChange={(petId) => change({ petId })}
          />
        ) : (
          <View style={styles.onlyPet}>
            <Text variant="label" tone="muted">
              {t.check.pet}
            </Text>
            <Text variant="h3">{chosen?.name ?? pets[0].name}</Text>
          </View>
        )}

        <Field
          label={t.check.symptoms}
          value={form.symptoms}
          onChangeText={(symptoms) => change({ symptoms })}
          placeholder={t.check.symptomsPlaceholder}
          error={symptomsError}
          multiline
        />

        <PhotoStrip
          t={t}
          photos={photos}
          onAdd={(source) => void pickPhotos(source)}
          onRemove={(index) => setPhotos((current) => current.filter((_, i) => i !== index))}
        />

        <Banner text={t.check.symptomsHint} />
      </Screen>
    )
  }

  return (
    <Screen
      title={t.check.title}
      scroll
      dock={
        <>
          <Button title={t.check.submit} onPress={() => void submit()} />
          <LinkButton title={t.common.back} onPress={() => setStep(1)} />
        </>
      }
    >
      <Steps current={2} of={2} label={t.check.step} />

      <SummaryCard>
        <View style={styles.summaryCopy}>
          <Text variant="h3">{chosen?.name ?? t.check.noPet}</Text>
          <Text variant="label" tone="muted" numberOfLines={1}>
            {form.symptoms}
          </Text>
          {photos.length > 0 ? (
            <Text variant="caption" tone="faint">
              {t.check.photoCount(photos.length)}
            </Text>
          ) : null}
        </View>
        <LinkButton title={t.check.change} onPress={() => setStep(1)} />
      </SummaryCard>

      <Banner text={t.check.optionalHint} />

      <Segment
        label={t.check.appetite}
        options={APPETITE_VALUES.map((value) => ({ value, label: t.appetite[value] }))}
        value={form.appetite}
        onChange={(appetite) => change({ appetite })}
      />
      <Segment
        label={t.check.activity}
        options={ACTIVITY_VALUES.map((value) => ({ value, label: t.activity[value] }))}
        value={form.activity}
        onChange={(activity) => change({ activity })}
      />
      <Segment
        label={t.check.duration}
        options={DURATION_VALUES.map((value) => ({ value, label: t.duration[value] }))}
        value={form.duration}
        onChange={(duration) => change({ duration })}
      />
      <Select
        label={t.check.stool}
        options={STOOL_VALUES.map((value) => ({ value, label: t.stool[value] }))}
        value={form.stool}
        onChange={(stool) => change({ stool })}
      />
      <Chips
        label={t.check.painSigns}
        options={PAIN_SIGNS.map((value) => ({ value, label: t.pain[value] }))}
        values={form.painSigns}
        onToggle={(sign) => change({ painSigns: toggleSign(form.painSigns, sign) })}
      />
    </Screen>
  )
}

/**
 * The minute the analysis takes.
 *
 * When it goes wrong the way out depends on why: an empty balance needs a
 * request, a slow answer will arrive in the history on its own, and anything
 * else is worth trying again. Offering all three would make the person choose
 * between explanations they do not have.
 */
function Waiting({
  t,
  failure,
  onRetry,
}: {
  t: Dictionary
  failure: { text: string; kind: AppError['kind'] | null } | null
  onRetry: () => void
}) {
  const recovery =
    failure?.kind === 'insufficient_credits'
      ? { title: t.check.requestCheck, onPress: () => router.push('/profile/extra-check') }
      : failure?.kind === 'still_running'
        ? { title: t.check.openHistory, onPress: () => router.replace('/profile/checks') }
        : { title: t.check.tryAgain, onPress: onRetry }

  return (
    <Screen
      centered
      dock={
        failure ? (
          <>
            <Button title={recovery.title} onPress={recovery.onPress} />
            <LinkButton title={t.common.toPets} onPress={() => router.replace('/pets')} />
          </>
        ) : null
      }
    >
      <Text variant="h1" center style={styles.waitingTitle}>
        {t.check.waitingTitle}
      </Text>
      <Image
        source={require('../../../assets/art/paw.png')}
        style={styles.waitingArt}
        resizeMode="contain"
        accessible={false}
      />
      {/* The spinner stops once there is nothing left to wait for. */}
      {failure ? null : <ActivityIndicator color={colour.accent} style={styles.spinner} />}
      {failure ? (
        <Banner text={failure.text} tone="error" />
      ) : (
        <Banner text={t.check.waitingBody} />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  summaryCopy: { flex: 1, minWidth: 0 },
  onlyPet: { marginBottom: space.block, gap: 6 },
  // The pair stands rather than sits, so it needs the height; a narrow phone
  // gets the smaller one, which leaves the button above the fold.
  emptyArt: { width: 228, height: 228, alignSelf: 'center', marginBottom: 8 },
  emptyArtNarrow: { width: 160, height: 160 },
  emptyTitle: { marginBottom: space.row },
  emptyCopy: { marginBottom: 24, alignSelf: 'center', maxWidth: 310 },
  waitingTitle: { marginBottom: 24 },
  waitingArt: { width: 216, height: 216, alignSelf: 'center', marginBottom: space.section },
  spinner: { marginBottom: 24 },
})
