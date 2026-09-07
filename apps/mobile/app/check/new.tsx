import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Button, Pressable, StyleSheet, Text, View } from 'react-native'
import { Link, router } from 'expo-router'
import {
  ACTIVITY_VALUES,
  APPETITE_VALUES,
  DURATION_VALUES,
  PAIN_SIGNS,
  STOOL_VALUES,
  type Pet,
} from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
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
import { Choice, Field } from '@/ui/Form'
import { Message, Screen } from '@/ui/Screen'

/** How often to ask, and for how long before saying so. */
const POLL_EVERY_MS = 1500
const GIVE_UP_AFTER_MS = 3 * 60 * 1000

export default function NewCheck() {
  const [form, setForm] = useState<CheckForm>(emptyCheckForm())
  const [pets, setPets] = useState<Pet[]>([])
  const [error, setError] = useState<string | null>(null)
  const [waiting, setWaiting] = useState(false)

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
  useEffect(() => () => {
    onScreen.current = false
  }, [])

  useEffect(() => {
    void withFreshSession((api) => api.listPets())
      .then(setPets)
      .catch(() => setPets([]))
  }, [])

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
        throw new Error(
          job.error_code === 'insufficient_credits'
            ? 'Не хватает проверок на балансе'
            : 'Анализ не удался. Попробуйте ещё раз',
        )
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_EVERY_MS))
      if (!onScreen.current) return
    }

    // The work is still going; the answer will be in the history when it lands.
    throw new Error('Анализ занимает дольше обычного. Загляните в историю позже')
  }, [])

  async function submit() {
    const input = formToCheckInput(form)
    if (!input.ok) {
      setError(input.message)
      return
    }

    key.current ??= newIdempotencyKey()
    setWaiting(true)
    setError(null)
    try {
      const accepted = await withFreshSession((api) => api.createCheck(key.current!, input.value))
      await waitForResult(accepted.job_id)
    } catch (cause) {
      if (!onScreen.current) return
      setError(cause instanceof Error ? cause.message : 'Не удалось отправить проверку')
      setWaiting(false)
    }
  }

  if (waiting) {
    return (
      <Screen title="Смотрим симптомы">
        <ActivityIndicator />
        <Message text="Это занимает до минуты. Не закрывайте экран." tone="info" />
      </Screen>
    )
  }

  return (
    <Screen title="Проверка симптомов" scroll>
      {pets.length > 0 ? (
        <Choice
          label="Питомец"
          options={pets.map((pet) => ({ value: pet.id, label: pet.name }))}
          value={form.petId}
          onChange={(petId) => change({ petId })}
        />
      ) : null}

      <Field
        label="Что происходит *"
        value={form.symptoms}
        onChangeText={(symptoms) => change({ symptoms })}
        placeholder="Вялый второй день, ест мало, прячется"
        multiline
      />

      <Choice
        label="Аппетит"
        options={APPETITE_VALUES.map((value) => ({ value, label: appetiteLabels[value] }))}
        value={form.appetite}
        onChange={(appetite) => change({ appetite })}
      />
      <Choice
        label="Активность"
        options={ACTIVITY_VALUES.map((value) => ({ value, label: activityLabels[value] }))}
        value={form.activity}
        onChange={(activity) => change({ activity })}
      />
      <Choice
        label="Симптомы длятся"
        options={DURATION_VALUES.map((value) => ({ value, label: durationLabels[value] }))}
        value={form.duration}
        onChange={(duration) => change({ duration })}
      />
      <Choice
        label="Стул"
        options={STOOL_VALUES.map((value) => ({ value, label: stoolLabels[value] }))}
        value={form.stool}
        onChange={(stool) => change({ stool })}
      />

      <View style={styles.group}>
        <Text style={styles.label}>Признаки боли</Text>
        <View style={styles.row}>
          {PAIN_SIGNS.map((sign) => {
            const chosen = form.painSigns.includes(sign)
            return (
              <Pressable
                key={sign}
                style={[styles.option, chosen ? styles.optionChosen : null]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: chosen }}
                onPress={() => change({ painSigns: toggleSign(form.painSigns, sign) })}
              >
                <Text style={chosen ? styles.optionTextChosen : styles.optionText}>
                  {painLabels[sign]}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      {error ? <Message text={error} /> : null}
      <Button title="Проверить" onPress={submit} />
      <Link href="/pets">Отмена</Link>
    </Screen>
  )
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  label: { fontSize: 13, color: '#444' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  optionChosen: { borderColor: '#1a1a1a', backgroundColor: '#1a1a1a' },
  optionText: { color: '#1a1a1a' },
  optionTextChosen: { color: '#fff' },
})
