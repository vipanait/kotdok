import { StyleSheet } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { VISIT_KINDS, VISIT_LIMITS, type VisitKind } from '@lapka/contracts'
import { localToday } from '@/lib/calendar-day'
import { useText } from '@/i18n'
import { canAddPrescription, dateOnSwitch, warnsHeldIsFinal } from '@/features/medical-record/visits'
import { PrescriptionCard } from '@/features/medical-record/PrescriptionCard'
import { useVisitForm, type VisitFormParams } from '@/features/medical-record/use-visit-form'
import { Button, LinkButton } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { DateField } from '@/ui/DateField'
import { SaveChangesDialog } from '@/ui/Dialog'
import { Field, Segment, Select } from '@/ui/Field'
import { Screen } from '@/ui/Screen'
import { FormSkeleton } from '@/ui/Skeleton'
import { Text } from '@/ui/Text'
import { space } from '@/ui/theme'

type Params = VisitFormParams & {
  id: string
  /** edit or done (a plan that happened); new when absent */
  mode?: string
}

/**
 * A vet visit (M9): «Был» with diagnosis and prescriptions, or «Запланировать».
 * From a result it opens filled in (§7.22). The check list holds this pet's
 * checks of the last 30 days; a link made earlier stays after that. Only a
 * plan is changed or marked «Был»: a visit that happened is history (owner
 * rule of 26 September 2026) — its form does not open, and a `record_done`
 * answer locks the form. Saving a visit that happened warns first that it
 * cannot be changed afterwards. Texts longer than the contract keeps are
 * said at their fields before anything is sent. What it holds and how it
 * saves is `useVisitForm`; this draws it.
 */
export default function VisitForm() {
  const params = useLocalSearchParams<Params>()
  const petId = params.id
  const mode = params.mode === 'edit' ? 'edit' : params.mode === 'done' ? 'done' : 'new'
  const form = useVisitForm(petId, mode, params)
  const { draft, errors, error, busy, locked, unsaved, input, change } = form
  const t = useText()
  const words = t.medicalRecord.visits

  if (!draft || locked) {
    return (
      <Screen title={words.visitTitle} onBack={() => router.back()}>
        {error && !locked ? <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} /> : null}
        {!error && !locked ? <FormSkeleton fields={5} /> : null}
        {locked ? (
          <>
            <Banner text={words.heldLocked} tone="info" />
            <Button title={t.common.back} kind="secondary" onPress={() => router.back()} />
          </>
        ) : null}
      </Screen>
    )
  }

  return (
    <Screen
      title={words.visitTitle}
      onBack={() => router.back()}
      scroll
      dock={<Button title={t.common.save} onPress={() => void form.save()} busy={busy} />}
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
          onChange={(status) => status && change({ status, date: dateOnSwitch(draft.date, status) })}
          note={draft.status === 'done' ? words.doneNote : words.planNote}
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
      <DateField
        label={words.date}
        value={draft.date}
        onChangeText={(date) => change({ date })}
        placeholder={t.medicalRecord.datePlaceholder}
        {...(draft.status === 'done' ? { max: localToday() } : { min: localToday() })}
        error={errors.date}
        fieldRef={input('date')}
      />
      <Field label={t.medicalRecord.clinic} value={draft.clinic} onChangeText={(clinic) => change({ clinic })} error={errors.clinic} fieldRef={input('clinic')} />
      <Field
        label={words.reason}
        value={draft.reason}
        onChangeText={(reason) => change({ reason })}
        placeholder={words.reasonPlaceholder}
        multiline
        error={errors.reason}
        fieldRef={input('reason')}
      />

      {draft.status === 'done' ? (
        <>
          <Field
            label={words.diagnosis}
            value={draft.diagnosis}
            onChangeText={(diagnosis) => change({ diagnosis })}
            multiline
            error={errors.diagnosis}
            fieldRef={input('diagnosis')}
          />
          <Text variant="h3" style={styles.heading}>
            {words.prescriptions}
          </Text>
          {draft.prescriptions.map((item) => (
            <PrescriptionCard
              key={item.key}
              item={item}
              nameError={errors.prescriptions?.[item.key]}
              instructionsError={errors.instructions?.[item.key]}
              fieldRef={input}
              onChange={(patch) =>
                change({ prescriptions: draft.prescriptions.map((p) => (p.key === item.key ? { ...p, ...patch } : p)) })
              }
              onRemove={() => change({ prescriptions: draft.prescriptions.filter((p) => p.key !== item.key) })}
            />
          ))}
          {canAddPrescription(draft) ? (
            <LinkButton title={words.addPrescription} align="left" onPress={form.addPrescription} />
          ) : (
            <Text variant="caption" tone="muted" style={styles.heading}>
              {words.prescriptionsFull(VISIT_LIMITS.prescriptions)}
            </Text>
          )}
        </>
      ) : null}

      {form.checkOptions.length > 0 ? (
        <Select
          label={words.check}
          options={form.checkOptions}
          value={draft.checkId}
          onChange={(checkId) => change({ checkId })}
          noneLabel={words.noCheck}
        />
      ) : null}
      <Field
        label={t.medicalRecord.notes}
        value={draft.notes}
        onChangeText={(notes) => change({ notes })}
        multiline
        error={errors.notes}
        fieldRef={input('notes')}
      />

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
          if (next) void form.save(next)
        }}
        onDiscard={() => unsaved.pending && unsaved.leave(unsaved.pending)}
        onStay={unsaved.stay}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  heading: { marginBottom: space.row },
  gap: { marginTop: space.row },
})
