import { StyleSheet } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { HEALTH_EVENT_LIMITS } from '@lapka/contracts'
import { dayInput, localToday } from '@/lib/calendar-day'
import { useText } from '@/i18n'
import { canAddItem, warnsDoneIsFinal, type FormMode } from '@/features/medical-record/event-form'
import { EventItemCard } from '@/features/medical-record/EventItemCard'
import { useEventForm, type EventFormParams } from '@/features/medical-record/use-event-form'
import { Button, LinkButton } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { DateField } from '@/ui/DateField'
import { SaveChangesDialog } from '@/ui/Dialog'
import { Field, Segment } from '@/ui/Field'
import { Screen } from '@/ui/Screen'
import { FormSkeleton } from '@/ui/Skeleton'
import { Text } from '@/ui/Text'
import { space } from '@/ui/theme'

type Params = EventFormParams & {
  id: string
  /** new (default), edit, complete */
  mode?: string
}

/**
 * The record form (M6, M14, M16): a new vaccination or treatment with several items and a
 * next date for each, a correction of one, or «Сделано» on one planned item
 * (§7.16). What it holds and how it saves is `useEventForm`; this draws it.
 */
export default function EventForm() {
  const params = useLocalSearchParams<Params>()
  const petId = params.id
  const mode: FormMode = params.mode === 'edit' ? 'edit' : params.mode === 'complete' ? 'complete' : 'new'
  const form = useEventForm(petId, mode, params)
  const { kind, species, draft, errors, error, locked, busy, unsaved } = form
  const t = useText()
  const words = t.medicalRecord

  const treatment = kind === 'parasite'
  const title = kind === null ? words.recordTitle : treatment ? words.treatmentTitle : words.vaccinationTitle

  if (!draft || !species || locked) {
    return (
      <Screen title={title} onBack={() => router.back()}>
        {error && !locked ? (
          <>
            <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} />
            <Button title={t.common.retry} kind="secondary" onPress={() => void form.load()} />
          </>
        ) : !locked ? (
          <FormSkeleton fields={4} />
        ) : null}
        {locked ? (
          <>
            <Banner text={locked.text} tone={locked.tone} />
            {locked.record ? (
              // The record saved first, to check it: in place of this form, so Back does not return here.
              <Button
                title={words.openRecord}
                onPress={() => router.replace(`/pets/${petId}/event/${locked.record}`)}
                style={styles.lockAction}
              />
            ) : null}
            <Button title={t.common.back} kind="secondary" onPress={() => router.back()} />
          </>
        ) : null}
      </Screen>
    )
  }

  return (
    <Screen
      title={title}
      onBack={() => router.back()}
      scroll
      dock={<Button title={t.common.save} onPress={() => void form.save()} busy={busy} />}
    >
      {mode === 'new' ? (
        <Segment
          label={title}
          labelHidden
          options={[
            { value: 'done', label: words.statusDone },
            { value: 'planned', label: words.statusPlanned },
          ]}
          value={draft.status}
          onChange={(status) =>
            status &&
            form.change({
              status,
              // A plan has no sensible default day; a done record starts from today.
              date: status === 'done' ? dayInput(localToday()) : '',
            })
          }
          clearable={false}
        />
      ) : null}

      <DateField
        label={draft.status === 'done' ? words.whenDone : words.whenPlanned}
        value={draft.date}
        onChangeText={(date) => form.change({ date })}
        placeholder={words.datePlaceholder}
        {...(draft.status === 'done' ? { max: localToday() } : { min: localToday() })}
        error={errors.date}
      />

      <Text variant="h3" style={styles.heading}>
        {treatment ? words.products : words.vaccines}
      </Text>

      {draft.items.map((item) => (
        <EventItemCard
          key={item.key}
          item={item}
          species={species}
          mode={mode}
          treatment={treatment}
          showNext={form.showNext}
          recordDay={form.recordDay}
          error={errors.items?.[item.key]}
          nextError={errors.next?.[item.key]}
          onUpdate={(next) => form.updateItem(item.key, next)}
          onRemove={
            draft.items.length > 1
              ? () => form.change({ items: draft.items.filter((other) => other.key !== item.key) })
              : undefined
          }
        />
      ))}

      {errors.form ? <Banner text={errors.form} tone="error" style={styles.gapBottom} /> : null}

      {mode === 'complete' ? null : canAddItem(draft) ? (
        <LinkButton title={treatment ? words.addProduct : words.addVaccine} align="left" onPress={form.addItem} />
      ) : (
        <Text variant="caption" tone="muted" style={styles.gapBottom}>
          {words.eventItemsFull(HEALTH_EVENT_LIMITS.items)}
        </Text>
      )}

      <Field label={words.clinic} value={draft.clinic} onChangeText={(clinic) => form.change({ clinic })} error={errors.clinic} />
      <Field label={words.notes} value={draft.notes} onChangeText={(notes) => form.change({ notes })} multiline error={errors.notes} />

      {form.summary ? <Banner text={form.summary} tone="info" style={styles.gapBottom} /> : null}
      {warnsDoneIsFinal(mode, draft.status) ? (
        <Text variant="caption" tone="muted" style={styles.gapBottom}>
          {words.doneWarning}
        </Text>
      ) : null}
      {error ? (
        <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} style={styles.gapBottom} />
      ) : null}

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
  gapBottom: { marginBottom: space.block },
  lockAction: { marginBottom: space.row },
})
