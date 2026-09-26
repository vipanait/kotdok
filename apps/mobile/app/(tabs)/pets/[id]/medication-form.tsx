import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { ApiError, courseEditable } from '@lapka/shared'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { localToday } from '@/lib/calendar-day'
import { newRequestKey } from '@/lib/request-key'
import { useText } from '@/i18n'
import { blankCourse, courseDraft, readCourses, type CourseDraft, type CourseErrors } from '@/features/medical-record/medications'
import { useUnsavedChanges } from '@/features/unsaved/useUnsavedChanges'
import { Button, IconButton, LinkButton } from '@/ui/Button'
import { Banner, Card } from '@/ui/Card'
import { SaveChangesDialog } from '@/ui/Dialog'
import { Field } from '@/ui/Field'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { TAP_TARGET, colour, space } from '@/ui/theme'

/**
 * Medicines (M19): several courses at once for a new entry, one for a
 * correction (`?medicationId=`). Free text with no catalogue: the dose is
 * the vet's (spec §7.12). A finished course is not corrected (owner rule of
 * 26 September 2026): opened here, it shows why and no save.
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
  const requestKey = useRef(newRequestKey())
  const nextKey = useRef(1)

  useEffect(() => {
    if (!editing) {
      const start = [blankCourse('new-0')]
      setInitial(start)
      setDrafts(start)
      return
    }
    withFreshSession((api) => api.getHealthOverview(petId))
      .then((overview) => {
        const course = overview.medications.find((m) => m.id === medicationId)
        if (!course) throw new Error('not found')
        if (!courseEditable(course, localToday())) {
          setLocked(true)
          return
        }
        setInitial([courseDraft(course)])
        setDrafts([courseDraft(course)])
      })
      .catch((cause) => setError(describeFailure(t, cause, t.errors.loadHealthFailed)))
  }, [editing, petId, medicationId, t])

  const changed = drafts !== null && initial !== null && JSON.stringify(drafts) !== JSON.stringify(initial)
  const unsaved = useUnsavedChanges(changed)

  const change = (key: string, patch: Partial<CourseDraft>) =>
    setDrafts((current) => current?.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)) ?? current)

  async function save(then: () => void = () => router.back()) {
    if (!drafts) return
    const read = readCourses(t, drafts)
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
          ? api.changeMedication(petId, medicationId!, read.value[0])
          : api.addMedications(petId, { items: read.value }, requestKey.current),
      )
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
      {!locked && drafts?.map((draft) => (
        <Card key={draft.key} outlined style={styles.card}>
          <View style={styles.head}>
            <View style={styles.fill}>
              <Field
                label={words.name}
                value={draft.name}
                onChangeText={(name) => change(draft.key, { name })}
                placeholder={words.namePlaceholder}
                autoCorrect={false}
                error={errors[draft.key]?.name}
              />
            </View>
            {drafts.length > 1 ? (
              <IconButton
                icon="close"
                label={words.remove}
                onPress={() => setDrafts(drafts.filter((other) => other.key !== draft.key))}
              />
            ) : null}
          </View>
          <Field
            label={words.dosage}
            value={draft.dosage}
            onChangeText={(dosage) => change(draft.key, { dosage })}
            placeholder={words.dosagePlaceholder}
            error={errors[draft.key]?.dosage}
          />
          <Field
            label={words.start}
            value={draft.start}
            onChangeText={(start) => change(draft.key, { start })}
            placeholder={t.medicalRecord.datePlaceholder}
            keyboardType="numbers-and-punctuation"
            error={errors[draft.key]?.start}
          />
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: draft.ongoing }}
            accessibilityLabel={words.ongoing}
            onPress={() => change(draft.key, { ongoing: !draft.ongoing, end: '' })}
            style={styles.toggle}
          >
            <Text style={styles.fill}>{words.ongoing}</Text>
            <View style={[styles.box, draft.ongoing ? styles.boxOn : null]}>
              {draft.ongoing ? <Text style={styles.tick}>✓</Text> : null}
            </View>
          </Pressable>
          {!draft.ongoing ? (
            <Field
              label={words.end}
              value={draft.end}
              onChangeText={(end) => change(draft.key, { end })}
              placeholder={t.medicalRecord.datePlaceholder}
              keyboardType="numbers-and-punctuation"
              error={errors[draft.key]?.end}
            />
          ) : null}
        </Card>
      ))}

      {drafts && !editing && !locked ? (
        <LinkButton
          title={words.addAnother}
          align="left"
          onPress={() => setDrafts([...drafts, blankCourse(`new-${nextKey.current++}`)])}
        />
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
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  fill: { flex: 1 },
  toggle: { flexDirection: 'row', alignItems: 'center', minHeight: TAP_TARGET, marginBottom: space.row },
  box: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colour.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colour.accent, borderColor: colour.accent },
  tick: { color: colour.surface, fontWeight: '700' },
  note: { marginTop: space.row, marginBottom: space.block },
})
