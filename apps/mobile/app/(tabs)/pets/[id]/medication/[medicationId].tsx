import { useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import type { Medication } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { useCached } from '@/lib/query-cache'
import { describeFailure } from '@/lib/errors'
import { localToday } from '@/lib/calendar-day'
import { useText } from '@/i18n'
import { canEndCourse, courseEditable } from '@lapka/shared'
import { courseDates, endCourse } from '@/features/medical-record/medications'
import { Button, LinkButton } from '@/ui/Button'
import { Banner, Card } from '@/ui/Card'
import { ConfirmDialog } from '@/ui/Dialog'
import { Screen } from '@/ui/Screen'
import { DoseTimes } from '@/features/medical-record/DoseTimes'
import { useRecordChanged } from '@/features/medical-record/record-cache'
import { DetailSkeleton } from '@/ui/Skeleton'
import { Text } from '@/ui/Text'
import { space } from '@/ui/theme'

/**
 * One course (X-course): its details; while it goes on, «Изменить» and
 * «Завершить курс»; delete always. A finished course is only read (owner rule
 * of 26 September 2026) — the server refuses its change (`record_done`).
 */
export default function MedicationView() {
  const { id, medicationId } = useLocalSearchParams<{ id: string; medicationId: string }>()
  const t = useText()
  const words = t.medicalRecord.meds
  // The pet's record through the cache shared by its screens: this course is one of its medications.
  const record = useCached(queryKeys.overview(id), () => withFreshSession((api) => api.getHealthOverview(id, localToday())))
  const found: Medication | null = useMemo(() => record.data?.medications.find((m) => m.id === medicationId) ?? null, [record.data, medicationId])
  /** The course as the server answered an action here, until the record has been read again. */
  const [answered, setCourse] = useState<Medication | null>(null)
  useEffect(() => setCourse(null), [found])
  const course = answered ?? found
  const [actionError, setError] = useState<{ text: string; offline: boolean } | null>(null)
  const error = actionError ?? (record.error ? describeFailure(t, record.error, t.errors.loadHealthFailed) : null)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const changed = useRecordChanged()
  /** The day «Завершить курс» first sent, until the server answers it (`endCourse`). */
  const ending = useRef<{ day: string | null }>({ day: null })

  // Gone since the list was read, or deleted here: back to the list, once.
  const leaving = useRef(false)
  useEffect(() => {
    if (record.data && !found && !leaving.current) {
      leaving.current = true
      router.back()
    }
  }, [record.data, found])

  const today = localToday()

  async function end() {
    setBusy(true)
    setError(null)
    try {
      // A course ended today gives no more doses: its times go first, while
      // it can still be changed, and with them today's remaining reminders.
      if (course && course.reminder_times.length > 0) {
        setCourse(await withFreshSession((api) => api.setMedicationTimes(id, medicationId, [])))
      }
      const ended = await endCourse(
        (patch, day) => withFreshSession((api) => api.changeMedication(id, medicationId, patch, day)),
        ending.current,
        today,
      )
      // Finished meanwhile, on another device: show it as it is now — read
      // only, which the screen then says in place of «Изменить».
      if (ended.kind === 'ended') setCourse(ended.course)
      else void record.reload()
    } catch (cause) {
      setError(describeFailure(t, cause, words.saveFailed))
    } finally {
      // Also when only the times went: their reminders go with them.
      void changed(id)
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await withFreshSession((api) => api.deleteMedication(id, medicationId, localToday()))
      // Its dose reminders go with it, not at the next start of the app.
      void changed(id)
      setAsking(false)
      leaving.current = true
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
        course && canEndCourse(course, today) ? (
          <Button title={words.end_} onPress={() => void end()} busy={busy} />
        ) : null
      }
    >
      {error ? (
        <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} style={styles.gap} />
      ) : !course ? (
        <DetailSkeleton />
      ) : null}
      {course ? (
        <>
          <Card outlined style={styles.card}>
            <Text variant="h2">{course.name}</Text>
            {course.dosage ? <Text tone="muted">{course.dosage}</Text> : null}
            <Text tone="muted">{courseDates(t, course, today)}</Text>
          </Card>
          {courseEditable(course, today) ? <DoseTimes petId={id} course={course} onChanged={setCourse} /> : null}
          {courseEditable(course, today) ? (
            <LinkButton title={words.edit} align="left" onPress={() => router.push(`/pets/${id}/medication-form?medicationId=${course.id}`)} />
          ) : (
            <Text tone="muted">{words.finishedReadOnly}</Text>
          )}
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
