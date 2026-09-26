import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { HISTORY_PAGE_SIZE_MAX, VISIT_KINDS, type SymptomCheckRecord, type VisitKind } from '@lapka/contracts'
import { ApiError } from '@lapka/shared'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { localToday } from '@/lib/calendar-day'
import { newRequestKey } from '@/lib/request-key'
import { useText } from '@/i18n'
import { urgencyText } from '@/features/checks/urgency'
import {
  blankVisit,
  readVisit,
  recentChecks,
  visitDraftFrom,
  visitLocked,
  warnsHeldIsFinal,
  type VisitDraft,
  type VisitErrors,
} from '@/features/medical-record/visits'
import { useReminders } from '@/features/medical-record/reminders/ReminderProvider'
import { useUnsavedChanges } from '@/features/unsaved/useUnsavedChanges'
import { Button, IconButton, LinkButton } from '@/ui/Button'
import { Banner, Card } from '@/ui/Card'
import { SaveChangesDialog } from '@/ui/Dialog'
import { Field, Segment, Select } from '@/ui/Field'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { TAP_TARGET, colour, space } from '@/ui/theme'

type Params = {
  id: string
  /** edit or done (a plan that happened); new when absent */
  mode?: string
  eventId?: string
  /** From a check result: link it, «Болезнь», its first line as the reason. */
  checkId?: string
  reason?: string
}

/**
 * A vet visit (M9): «Был» with diagnosis and prescriptions, or «Запланировать».
 * From a result it opens filled in (§7.22). The check list holds this pet's
 * checks of the last 30 days; a link made earlier stays after that. Only a
 * plan is changed or marked «Был»: a visit that happened is history (owner
 * rule of 26 September 2026) — its form does not open, and a `record_done`
 * answer locks the form. Saving a visit that happened warns first that it
 * cannot be changed afterwards.
 */
export default function VisitForm() {
  const params = useLocalSearchParams<Params>()
  const petId = params.id
  const mode = params.mode === 'edit' ? 'edit' : params.mode === 'done' ? 'done' : 'new'
  const t = useText()
  const reminders = useReminders()
  const words = t.medicalRecord.visits
  const [initial, setInitial] = useState<VisitDraft | null>(null)
  const [draft, setDraft] = useState<VisitDraft | null>(null)
  const [keptDate, setKeptDate] = useState<string | undefined>(undefined)
  const [checks, setChecks] = useState<SymptomCheckRecord[]>([])
  const [errors, setErrors] = useState<VisitErrors>({})
  const [error, setError] = useState<{ text: string; offline: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  /** A visit that happened: nothing here can change it. */
  const [locked, setLocked] = useState(false)
  const requestKey = useRef(newRequestKey())
  const nextKey = useRef(1)

  useEffect(() => {
    // Checks of the last 30 days: a visit follows a check soon after it.
    withFreshSession((api) => api.listChecks({ pet_id: petId, limit: HISTORY_PAGE_SIZE_MAX }))
      .then((page) => setChecks(recentChecks(page.items)))
      .catch(() => setChecks([]))

    if (mode === 'new') {
      const start = blankVisit('done')
      if (params.checkId) {
        start.checkId = params.checkId
        start.visitKind = 'illness'
        start.reason = params.reason ?? ''
      }
      setInitial(start)
      setDraft(start)
      return
    }
    withFreshSession((api) => api.getHealthOverview(petId))
      .then((overview) => {
        const visit = overview.events.find((event) => event.id === params.eventId && event.kind === 'visit')
        if (!visit) throw new Error('not found')
        if (visitLocked(visit)) {
          setLocked(true)
          return
        }
        const start = visitDraftFrom(visit, mode === 'done' ? 'done' : undefined)
        setKeptDate(visit.date)
        setInitial(start)
        setDraft(start)
      })
      .catch((cause) => setError(describeFailure(t, cause, t.medicalRecord.loadEventFailed)))
  }, [petId, mode, params.eventId, params.checkId, params.reason, t])

  const changed = draft !== null && initial !== null && JSON.stringify(draft) !== JSON.stringify(initial)
  const unsaved = useUnsavedChanges(changed)
  const change = (patch: Partial<VisitDraft>) => setDraft((current) => (current ? { ...current, ...patch } : current))

  async function save(then: () => void = () => router.back()) {
    if (!draft) return
    const read = readVisit(t, draft, mode, new Date(), keptDate)
    if (!read.ok) {
      setErrors(read.errors)
      return
    }
    setErrors({})
    setBusy(true)
    setError(null)
    try {
      const value = read.value
      await withFreshSession<unknown>((api) => {
        if (mode === 'new') return api.createVisit(petId, value, requestKey.current)
        const { status, date, ...rest } = value
        return api.changeVisit(
          petId,
          params.eventId!,
          {
            ...rest,
            ...(mode === 'done' ? { status: 'done' as const } : {}),
            ...(status === 'done' || date !== keptDate ? { date } : {}),
            ...(status === 'planned' ? { diagnosis: undefined, prescriptions: undefined } : {}),
          },
          requestKey.current,
        )
      })
      if (value.status === 'planned' && mode === 'new') reminders.planSaved({ kind: 'visit', name: null, targets: [] })
      else reminders.refresh()
      unsaved.leave(then)
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'record_done') {
        // Marked «Был» meanwhile (another device): history now, nothing to save.
        unsaved.leave(() => setLocked(true))
      } else if (cause instanceof ApiError && cause.code === 'conflict') setError({ text: t.medicalRecord.alreadySaved, offline: false })
      else setError(describeFailure(t, cause, t.medicalRecord.saveEventFailed))
    } finally {
      setBusy(false)
    }
  }

  if (!draft || locked) {
    return (
      <Screen title={words.visitTitle} onBack={() => router.back()}>
        {error && !locked ? <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} /> : null}
        {locked ? (
          <>
            <Banner text={words.heldLocked} tone="info" />
            <Button title={t.common.back} kind="secondary" onPress={() => router.back()} />
          </>
        ) : null}
      </Screen>
    )
  }

  const done = draft.status === 'done'
  const checkOptions = checks.map((check) => ({
    value: check.id,
    label: words.checkLine(urgencyText(t, check.urgency).label, t.day(localToday(new Date(check.created_at)), false)),
  }))
  // A link to an older check stays selectable, not silently dropped.
  if (draft.checkId && !checkOptions.some((option) => option.value === draft.checkId)) {
    checkOptions.unshift({ value: draft.checkId, label: words.linkedCheck })
  }

  return (
    <Screen
      title={words.visitTitle}
      onBack={() => router.back()}
      scroll
      dock={<Button title={t.common.save} onPress={() => void save()} busy={busy} />}
    >
      {mode === 'new' ? (
        <Segment
          label={words.visitTitle}
          labelHidden
          options={[
            { value: 'done', label: words.done },
            { value: 'planned', label: words.plan },
          ]}
          value={draft.status}
          onChange={(status) =>
            status && change({ status, date: status === 'done' ? blankVisit('done').date : '' })
          }
          clearable={false}
        />
      ) : null}
      <Select
        label={words.kind}
        options={VISIT_KINDS.map((kind: VisitKind) => ({ value: kind, label: words.kinds[kind] }))}
        value={draft.visitKind}
        onChange={(visitKind) => visitKind && change({ visitKind })}
        allowNone={false}
      />
      <Field
        label={words.date}
        value={draft.date}
        onChangeText={(date) => change({ date })}
        placeholder={t.medicalRecord.datePlaceholder}
        keyboardType="numbers-and-punctuation"
        error={errors.date}
      />
      <Field label={t.medicalRecord.clinic} value={draft.clinic} onChangeText={(clinic) => change({ clinic })} />
      <Field
        label={words.reason}
        value={draft.reason}
        onChangeText={(reason) => change({ reason })}
        placeholder={words.reasonPlaceholder}
        multiline
      />

      {done ? (
        <>
          <Field label={words.diagnosis} value={draft.diagnosis} onChangeText={(diagnosis) => change({ diagnosis })} multiline />
          <Text variant="h3" style={styles.heading}>
            {words.prescriptions}
          </Text>
          {draft.prescriptions.map((item) => (
            <Card key={item.key} outlined style={styles.card}>
              <View style={styles.head}>
                <View style={styles.fill}>
                  <Field
                    label={words.prescription}
                    value={item.name}
                    onChangeText={(name) =>
                      change({ prescriptions: draft.prescriptions.map((p) => (p.key === item.key ? { ...p, name } : p)) })
                    }
                    autoCorrect={false}
                    error={errors.prescriptions?.[item.key]}
                  />
                </View>
                <IconButton
                  icon="close"
                  label={words.removePrescription}
                  onPress={() => change({ prescriptions: draft.prescriptions.filter((p) => p.key !== item.key) })}
                />
              </View>
              <Field
                label={words.instructions}
                value={item.instructions}
                onChangeText={(instructions) =>
                  change({ prescriptions: draft.prescriptions.map((p) => (p.key === item.key ? { ...p, instructions } : p)) })
                }
              />
              {item.inMedicines ? (
                <Text variant="label" tone="muted">
                  {words.inMedicines}
                </Text>
              ) : !item.id ? (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.toMedicines }}
                  accessibilityLabel={words.toMedicines}
                  onPress={() =>
                    change({
                      prescriptions: draft.prescriptions.map((p) => (p.key === item.key ? { ...p, toMedicines: !p.toMedicines } : p)),
                    })
                  }
                  style={styles.toggle}
                >
                  <Text style={styles.fill}>{words.toMedicines}</Text>
                  <View style={[styles.box, item.toMedicines ? styles.boxOn : null]}>
                    {item.toMedicines ? <Text style={styles.tick}>✓</Text> : null}
                  </View>
                </Pressable>
              ) : null}
            </Card>
          ))}
          <LinkButton
            title={words.addPrescription}
            align="left"
            onPress={() =>
              change({
                prescriptions: [...draft.prescriptions, { key: `new-${nextKey.current++}`, name: '', instructions: '', toMedicines: true }],
              })
            }
          />
        </>
      ) : null}

      {checkOptions.length > 0 ? (
        <Select
          label={words.check}
          options={checkOptions}
          value={draft.checkId}
          onChange={(checkId) => change({ checkId })}
          noneLabel={words.noCheck}
        />
      ) : null}
      <Field label={t.medicalRecord.notes} value={draft.notes} onChangeText={(notes) => change({ notes })} multiline />

      {warnsHeldIsFinal(mode, draft.status) ? (
        <Text variant="caption" tone="muted" style={styles.gap}>
          {words.heldWarning}
        </Text>
      ) : null}
      {error ? <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} style={styles.gap} /> : null}

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
  heading: { marginBottom: space.row },
  card: { padding: 16 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  fill: { flex: 1 },
  toggle: { flexDirection: 'row', alignItems: 'center', minHeight: TAP_TARGET },
  box: { width: 28, height: 28, borderRadius: 6, borderWidth: 2, borderColor: colour.line, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colour.accent, borderColor: colour.accent },
  tick: { color: colour.surface, fontWeight: '700' },
  gap: { marginTop: space.row },
})
