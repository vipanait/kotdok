import { useCallback, useState } from 'react'
import { StyleSheet } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import type { Medication } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { localToday } from '@/lib/calendar-day'
import { useText } from '@/i18n'
import { courseDates, isCurrent } from '@/features/medical-record/medications'
import { Button, LinkButton } from '@/ui/Button'
import { Banner, Card } from '@/ui/Card'
import { ConfirmDialog } from '@/ui/Dialog'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { space } from '@/ui/theme'

/** One course (X-course): its details, «Изменить», «Завершить курс» while current, delete. */
export default function MedicationView() {
  const { id, medicationId } = useLocalSearchParams<{ id: string; medicationId: string }>()
  const t = useText()
  const words = t.medicalRecord.meds
  const [course, setCourse] = useState<Medication | null>(null)
  const [error, setError] = useState<{ text: string; offline: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const overview = await withFreshSession((api) => api.getHealthOverview(id))
      const found = overview.medications.find((m) => m.id === medicationId)
      if (!found) {
        router.back()
        return
      }
      setCourse(found)
    } catch (cause) {
      setError(describeFailure(t, cause, t.errors.loadHealthFailed))
    }
  }, [id, medicationId, t])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const today = localToday()

  async function end() {
    setBusy(true)
    setError(null)
    try {
      setCourse(await withFreshSession((api) => api.changeMedication(id, medicationId, { ended_on: today, ongoing: false })))
    } catch (cause) {
      setError(describeFailure(t, cause, words.saveFailed))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await withFreshSession((api) => api.deleteMedication(id, medicationId))
      setAsking(false)
      router.back()
    } catch (cause) {
      setAsking(false)
      setError(describeFailure(t, cause, words.saveFailed))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen
      title={words.courseTitle}
      onBack={() => router.back()}
      scroll
      // A course that has not started yet is corrected or deleted, not ended.
      dock={
        course && isCurrent(course, today) && (course.started_on === null || course.started_on <= today) ? (
          <Button title={words.end_} onPress={() => void end()} busy={busy} />
        ) : null
      }
    >
      {error ? <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} style={styles.gap} /> : null}
      {course ? (
        <>
          <Card outlined style={styles.card}>
            <Text variant="h2">{course.name}</Text>
            {course.dosage ? <Text tone="muted">{course.dosage}</Text> : null}
            <Text tone="muted">{courseDates(t, course, today)}</Text>
          </Card>
          <LinkButton title={words.edit} align="left" onPress={() => router.push(`/pets/${id}/medication-form?medicationId=${course.id}`)} />
          <LinkButton title={words.delete} align="left" onPress={() => setAsking(true)} />
        </>
      ) : null}

      <ConfirmDialog
        visible={asking}
        title={words.deleteTitle}
        message={words.deleteBody}
        confirmTitle={t.pets.removeConfirm}
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setAsking(false)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  gap: { marginBottom: space.block },
  card: { padding: 20, gap: 6 },
})
