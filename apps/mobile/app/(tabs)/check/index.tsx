import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, AppState, Image, StyleSheet, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import {
  ACTIVITY_VALUES,
  APPETITE_VALUES,
  DURATION_VALUES,
  PAIN_SIGNS,
  STOOL_VALUES,
  type Pet,
} from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { AppError, errorMessage } from '@/lib/errors'
import { useAuth } from '@/providers/AuthProvider'
import { draftStorage } from '@/lib/supabase'
import {
  DRAFT_KEY,
  isWorthKeeping,
  parseDraft,
  serialiseDraft,
  type CheckDraft,
} from '@/features/checks/check-draft'
import {
  activityLabels,
  appetiteLabels,
  durationLabels,
  emptyCheckForm,
  formToCheckInput,
  newIdempotencyKey,
  painLabels,
  stoolLabels,
  toggleSign,
  type CheckForm,
} from '@/features/checks/check-form'
import { Button, LinkButton } from '@/ui/Button'
import { Banner, IconAvatar } from '@/ui/Card'
import { Chips, Field, Segment, Select } from '@/ui/Field'
import { Screen } from '@/ui/Screen'
import { Steps, SummaryCard } from '@/ui/Section'
import { Text } from '@/ui/Text'
import { colour, space } from '@/ui/theme'

/** How often to ask, and for how long before saying so. */
const POLL_EVERY_MS = 1500
const GIVE_UP_AFTER_MS = 3 * 60 * 1000

/** Beyond three names the row stops fitting, so the sheet takes over. */
const SEGMENT_FITS = 3

export default function NewCheck() {
  const [form, setForm] = useState<CheckForm>(emptyCheckForm())
  const [pets, setPets] = useState<Pet[] | null>(null)
  const [petsError, setPetsError] = useState<string | null>(null)
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

  const keepDraft = useCallback(async () => {
    if (!userId) return
    const { form: current, step: at } = latest.current

    if (!isWorthKeeping(current)) {
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

  useFocusEffect(
    useCallback(() => () => {
      void keepDraft()
    }, [keepDraft]),
  )

  // Kept across renders so a retry after a lost answer reuses the same key and
  // is not charged a second time.
  const key = useRef<string | null>(null)

  /**
   * Whether this screen is still the one the person is looking at.
   *
   * Polling outlives the screen otherwise: a person who leaves while the
   * analysis runs would be yanked to a result from wherever they had got to,
   * because the loop finishes and calls replace regardless.
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
      setPetsError(errorMessage(cause, 'Не удалось загрузить питомцев'))
    }
  }, [])

  useEffect(() => {
    void loadPets()
  }, [loadPets])

  function change(patch: Partial<CheckForm>) {
    setForm((current) => ({ ...current, ...patch }))
  }

  const waitForResult = useCallback(async (jobId: string) => {
    const deadline = Date.now() + GIVE_UP_AFTER_MS

    while (Date.now() < deadline) {
      const job = await withFreshSession((api) => api.getCheckJob(jobId))
      // Left the screen while we were asking: the answer is in the history, and
      // dragging them out of wherever they are now would be worse than silence.
      if (!onScreen.current) return

      if (job.status === 'completed' && job.check_id) {
        router.replace(`/check/${job.check_id}`)
        return
      }
      if (job.status === 'failed') {
        throw job.error_code === 'insufficient_credits'
          ? new AppError('Не хватает проверок на балансе', 'insufficient_credits')
          : new AppError('Анализ не удался. Попробуйте ещё раз', 'analysis_failed')
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_EVERY_MS))
      if (!onScreen.current) return
    }

    // The work is still going; the answer will be in the history when it lands.
    throw new AppError('Анализ занимает дольше обычного. Загляните в историю позже', 'still_running')
  }, [])

  function next() {
    const input = formToCheckInput(form)
    if (!input.ok) {
      setSymptomsError(input.message)
      return
    }
    setSymptomsError(null)
    setStep(2)
  }

  async function submit() {
    const input = formToCheckInput(form)
    if (!input.ok) {
      setSymptomsError(input.message)
      setStep(1)
      return
    }

    key.current ??= newIdempotencyKey()
    setWaiting(true)
    setFailure(null)
    try {
      const accepted = await withFreshSession((api) => api.createCheck(key.current!, input.value))
      // Sent and charged: keeping it now would offer to send it a second time.
      await forgetDraft()
      await waitForResult(accepted.job_id)
    } catch (cause) {
      if (!onScreen.current) return
      setFailure({
        text: errorMessage(cause, 'Не удалось отправить проверку'),
        kind: cause instanceof AppError ? cause.kind : null,
      })
      setWaiting(false)
    }
  }

  if (waiting || failure) {
    return <Waiting failure={failure} onRetry={() => void submit()} />
  }

  if (petsError) {
    return (
      <Screen title="Проверка симптомов">
        <Banner text={petsError} tone="error" icon="wifi" />
        <Button title="Повторить" kind="secondary" onPress={() => void loadPets()} />
      </Screen>
    )
  }

  if (pets === null) {
    return (
      <Screen title="Проверка симптомов">
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
      <Screen title="Проверка симптомов" centered>
        <View style={styles.emptyArt}>
          <IconAvatar icon="paw" size={72} />
        </View>
        <Text variant="h2" center style={styles.emptyTitle}>
          Сначала добавьте питомца
        </Text>
        <Text tone="muted" center style={styles.emptyCopy}>
          Ответ опирается на вид, возраст и хронические болезни. Без них проверка
          получится общей, а списана будет как обычная.
        </Text>
        <Button title="Добавить питомца" onPress={() => router.push('/pets/new')} />
      </Screen>
    )
  }

  const chosen = pets.find((pet) => pet.id === form.petId)

  if (step === 1) {
    return (
      <Screen
        title="Проверка симптомов"
        scroll
        dock={
          <>
            <Button title="Далее" onPress={next} />
            <LinkButton title="Отмена" onPress={() => router.replace('/pets')} />
          </>
        }
      >
        <Steps current={1} of={2} />

        {pets.length <= SEGMENT_FITS ? (
          <Segment
            label="Питомец"
            clearable={false}
            options={pets.map((pet) => ({ value: pet.id, label: pet.name }))}
            value={form.petId}
            onChange={(petId) => change({ petId })}
          />
        ) : (
          <Select
            label="Питомец"
            options={pets.map((pet) => ({ value: pet.id, label: pet.name }))}
            value={form.petId}
            onChange={(petId) => change({ petId })}
          />
        )}

        <Field
          label="Что происходит *"
          value={form.symptoms}
          onChangeText={(symptoms) => change({ symptoms })}
          placeholder="Вялый второй день, ест мало, прячется"
          error={symptomsError}
          multiline
        />

        <Banner text="Пишите как есть, своими словами. Чем подробнее — тем точнее ответ." />
      </Screen>
    )
  }

  return (
    <Screen
      title="Проверка симптомов"
      scroll
      dock={
        <>
          <Button title="Проверить" onPress={() => void submit()} />
          <LinkButton title="Назад" onPress={() => setStep(1)} />
        </>
      }
    >
      <Steps current={2} of={2} />

      <SummaryCard>
        <View style={styles.summaryCopy}>
          <Text variant="h3">{chosen?.name ?? 'Без питомца'}</Text>
          <Text variant="label" tone="muted" numberOfLines={1}>
            {form.symptoms}
          </Text>
        </View>
        <LinkButton title="Изменить" onPress={() => setStep(1)} />
      </SummaryCard>

      <Banner text="Всё необязательно, но каждый ответ уточняет результат." />

      <Segment
        label="Аппетит"
        options={APPETITE_VALUES.map((value) => ({ value, label: appetiteLabels[value] }))}
        value={form.appetite}
        onChange={(appetite) => change({ appetite })}
      />
      <Segment
        label="Активность"
        options={ACTIVITY_VALUES.map((value) => ({ value, label: activityLabels[value] }))}
        value={form.activity}
        onChange={(activity) => change({ activity })}
      />
      <Segment
        label="Симптомы длятся"
        options={DURATION_VALUES.map((value) => ({ value, label: durationLabels[value] }))}
        value={form.duration}
        onChange={(duration) => change({ duration })}
      />
      <Select
        label="Стул"
        options={STOOL_VALUES.map((value) => ({ value, label: stoolLabels[value] }))}
        value={form.stool}
        onChange={(stool) => change({ stool })}
      />
      <Chips
        label="Признаки боли"
        options={PAIN_SIGNS.map((value) => ({ value, label: painLabels[value] }))}
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
  failure,
  onRetry,
}: {
  failure: { text: string; kind: AppError['kind'] | null } | null
  onRetry: () => void
}) {
  const recovery =
    failure?.kind === 'insufficient_credits'
      ? { title: 'Запросить проверку', onPress: () => router.push('/profile/extra-check') }
      : failure?.kind === 'still_running'
        ? { title: 'Открыть историю', onPress: () => router.replace('/profile/checks') }
        : { title: 'Попробовать ещё раз', onPress: onRetry }

  return (
    <Screen
      centered
      dock={
        failure ? (
          <>
            <Button title={recovery.title} onPress={recovery.onPress} />
            <LinkButton title="К питомцам" onPress={() => router.replace('/pets')} />
          </>
        ) : null
      }
    >
      <Text variant="h1" center style={styles.waitingTitle}>
        Смотрим симптомы
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
        <Banner text="Это занимает до минуты. Не закрывайте экран." />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  summaryCopy: { flex: 1, minWidth: 0 },
  emptyArt: { alignItems: 'center', marginBottom: 24 },
  emptyTitle: { marginBottom: space.row },
  emptyCopy: { marginBottom: 24, alignSelf: 'center', maxWidth: 310 },
  waitingTitle: { marginBottom: 24 },
  waitingArt: { width: 216, height: 216, alignSelf: 'center', marginBottom: space.section },
  spinner: { marginBottom: 24 },
})
