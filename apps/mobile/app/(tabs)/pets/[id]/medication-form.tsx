import { useEffect, useRef, useState } from 'react'
import { StyleSheet } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { MEDICATION_LIMITS } from '@lapka/contracts'
import { ApiError, courseEditable, startMayStayEmpty } from '@lapka/shared'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { localToday } from '@/lib/calendar-day'
import { newRequestKey } from '@/lib/request-key'
import { useText } from '@/i18n'
import {
  blankCourse,
  canAddCourse,
  courseDraft,
  readCourses,
  type CourseDraft,
  type CourseErrors,
} from '@/features/medical-record/medications'
import { useUnsavedChanges } from '@/features/unsaved/useUnsavedChanges'
import { useOverviewReader, useRecordChanged } from '@/features/medical-record/record-cache'
import { CourseFields } from '@/features/medical-record/CourseFields'
import { Button, LinkButton } from '@/ui/Button'
import { Banner, Card } from '@/ui/Card'
import { SaveChangesDialog } from '@/ui/Dialog'
import { Screen } from '@/ui/Screen'
import { FormSkeleton } from '@/ui/Skeleton'
import { Text } from '@/ui/Text'
import { space } from '@/ui/theme'

/**
 * Medicines (M19): several courses at once for a new entry, one for a
 * correction (`?medicationId=`). Free text with no catalogue: the dose is
 * the vet's (spec §7.12). A course needs a start, today by default; only one
 * from the pet form whose start nobody knows may keep it empty. An end of
 * today or earlier is said before saving: the course will be finished. A
 * finished course is not corrected (owner rule of 26 September 2026): opened
 * here, it shows why and no save.
 */
export default function MedicationForm() {
  const { id: petId, medicationId } = useLocalSearchParams<{ id: string; medicationId?: string }>()
  const t = useText()
  const words = t.medicalRecord.meds
  const editing = typeof medicationId === 'string' && medicationId !== ''
  const [initial, setInitial] = useState<CourseDraft[] | null>(null)
  const [drafts, setDrafts] = useState<CourseDraft[] | null>(null)
  const [errors, setErrors] = useState<CourseErrors>({})
  const [error, setError] = useState<{ text: string; offline: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  /** The course being corrected has finished: history, read only. */
  const [locked, setLocked] = useState(false)
  /** The course being corrected has no start on file and may keep it so (shared `startMayStayEmpty`). */
  const [startOptional, setStartOptional] = useState(false)
  const requestKey = useRef(newRequestKey())
  const nextKey = useRef(1)
  const readOverview = useOverviewReader()

  useEffect(() => {
    if (!editing) {
      const start = [blankCourse('new-0')]
      setInitial(start)
      setDrafts(start)
      return
    }
    readOverview(petId)
      .then((overview) => {
        const course = overview.medications.find((m) => m.id === medicationId)
        if (!course) throw new Error('not found')
        if (!courseEditable(course, localToday())) {
          setLocked(true)
          return
        }
        setStartOptional(startMayStayEmpty(course))
        setInitial([courseDraft(course)])
        setDrafts([courseDraft(course)])
      })
      .catch((cause) => setError(describeFailure(t, cause, t.errors.loadHealthFailed)))
  }, [editing, petId, medicationId, t, readOverview])

  const changed = drafts !== null && initial !== null && JSON.stringify(drafts) !== JSON.stringify(initial)
  const unsaved = useUnsavedChanges(changed)
  const recordChanged = useRecordChanged()

  const change = (key: string, patch: Partial<CourseDraft>) =>
    setDrafts((current) => current?.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)) ?? current)

  async function save(then: () => void = () => router.back()) {
    if (!drafts) return
    const read = readCourses(t, drafts, startOptional)
    if (!read.ok) {
      setErrors(read.errors)
      return
    }
    setErrors({})
    setBusy(true)
    setError(null)
    try {
      await withFreshSession<unknown>((api) =>
        editing
          ? // With the owner's day: the server counts a finished course by it, as this form does.
            api.changeMedication(petId, medicationId!, read.value[0], localToday())
          : api.addMedications(petId, { items: read.value }, requestKey.current, localToday()),
      )
      // New dates move or end the course's dose reminders (FB-5).
      void recordChanged(petId)
      unsaved.leave(then)
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'conflict') {
        setError({ text: t.medicalRecord.alreadySaved, offline: false })
      } else if (cause instanceof ApiError && cause.code === 'record_done') {
        // Finished meanwhile (or on another device): nothing to save here any
        // more, so nothing to ask about on the way out either.
        unsaved.leave(() => setLocked(true))
      } else {
        setError(describeFailure(t, cause, words.saveFailed))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen
      title={words.courseTitle}
      onBack={() => router.back()}
      scroll
      dock={drafts && !locked ? <Button title={t.common.save} onPress={() => void save()} busy={busy} /> : null}
    >
      {locked ? (
        <>
          <Banner text={words.finishedReadOnly} tone="info" style={styles.note} />
          <Button title={t.common.back} kind="secondary" onPress={() => unsaved.leave(() => router.back())} />
        </>
      ) : null}
      {!locked && !drafts && !error ? <FormSkeleton fields={4} /> : null}
      {!locked && drafts?.map((draft) => (
        <Card key={draft.key} outlined style={styles.card}>
          <CourseFields
            draft={draft}
            errors={errors[draft.key]}
            startOptional={startOptional}
            onChange={(patch) => change(draft.key, patch)}
            onRemove={drafts.length > 1 ? () => setDrafts(drafts.filter((other) => other.key !== draft.key)) : undefined}
          />
        </Card>
      ))}

      {drafts && !editing && !locked ? (
        canAddCourse(drafts) ? (
          <LinkButton
            title={words.addAnother}
            align="left"
            onPress={() => setDrafts([...drafts, blankCourse(`new-${nextKey.current++}`)])}
          />
        ) : (
          <Text variant="caption" tone="muted">
            {words.itemsFull(MEDICATION_LIMITS.items)}
          </Text>
        )
      ) : null}

      <Text variant="caption" tone="faint" style={styles.note}>
        {words.note}
      </Text>

      {error ? (
        <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} style={styles.note} />
      ) : null}

      <SaveChangesDialog
        visible={unsaved.pending !== null}
        busy={busy}
        onSave={() => {
          const next = unsaved.pending
          unsaved.stay()
          if (next) void save(next)
        }}
        onDiscard={() => unsaved.pending && unsaved.leave(unsaved.pending)}
        onStay={unsaved.stay}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  note: { marginTop: space.row, marginBottom: space.block },
})
