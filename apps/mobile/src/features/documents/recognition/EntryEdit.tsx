import { useState } from 'react'
import { AccessibilityInfo, StyleSheet, View } from 'react-native'
import type { PetSpecies } from '@lapka/contracts'
import type { DraftEntry } from '@lapka/shared'
import { useText } from '@/i18n'
import { parseDayInput } from '@/lib/calendar-day'
import { CourseFields } from '@/features/medical-record/CourseFields'
import { EventItemCard } from '@/features/medical-record/EventItemCard'
import { readDraft, type DraftErrors, type EventDraft, type ItemDraft } from '@/features/medical-record/event-form'
import { readCourses, type CourseDraft, type CourseErrors } from '@/features/medical-record/medications'
import { Button, LinkButton } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { DateField } from '@/ui/DateField'
import { Text } from '@/ui/Text'
import { space } from '@/ui/theme'
import { Notice } from '../parts'
import { StateActions } from './RecognitionStates'
import { entryFromCourseRead, entryFromEventRead, type EditState } from './recognition-view'

/**
 * One recognised entry opened from the review with its values (design run
 * «edit»): a vaccination or treatment in the record form's own fields — the
 * day, the item card with the catalogue, the target chips or parasite groups
 * and the next date — and a course in the medicine form's. «Готово» checks
 * it by those forms' rules (`readDraft`, `readCourses`) and hands the entry
 * back; nothing reaches the medical record until the review is confirmed.
 *
 * The form's state lives with the review (`state`/`onStateChange`), so a
 * trip to a page of the original keeps what was typed. The screen around it
 * — «← К проверке» and the question on leaving with changes — is the
 * review's.
 */
export function EntryEdit({
  entry,
  state,
  species,
  today,
  onOpenPage,
  onStateChange,
  onDone,
  onCancel,
}: {
  /** The entry as the review has it now. */
  entry: DraftEntry
  state: EditState
  species: PetSpecies
  /** The review's day: the record's date may not be later, and the confirm sends by the same day. */
  today: string
  onOpenPage: () => void
  onStateChange: (state: EditState) => void
  onDone: (entry: DraftEntry) => void
  /** «Отмена»: the review asks first when something was changed. */
  onCancel: () => void
}) {
  const t = useText()
  const words = t.documents.recognition.edit
  const [eventErrors, setEventErrors] = useState<DraftErrors>({})
  const [courseErrors, setCourseErrors] = useState<CourseErrors>({})

  function setEvent(draft: EventDraft) {
    onStateChange({ ...state, form: { kind: 'event', draft } })
  }

  function setCourse(draft: CourseDraft) {
    onStateChange({ ...state, form: { kind: 'course', draft } })
  }

  function done() {
    if (state.form.kind === 'event' && entry.type !== 'medication') {
      // Noon of the review's day, so the form's own reader judges by that day and no other.
      const read = readDraft(t, state.form.draft, 'new', new Date(`${today}T12:00:00`))
      if (!read.ok) {
        setEventErrors(read.errors)
        const first = read.errors.date ?? Object.values(read.errors.items ?? {})[0] ?? Object.values(read.errors.next ?? {})[0] ?? read.errors.form
        if (first) AccessibilityInfo.announceForAccessibility(first)
        return
      }
      onDone(entryFromEventRead(entry, read.value))
      return
    }
    if (state.form.kind === 'course' && entry.type === 'medication') {
      const read = readCourses(t, [state.form.draft])
      if (!read.ok) {
        setCourseErrors(read.errors)
        const own = read.errors[state.form.draft.key]
        const first = own?.name ?? own?.dosage ?? own?.start ?? own?.end
        if (first) AccessibilityInfo.announceForAccessibility(first)
        return
      }
      onDone(entryFromCourseRead(entry, read.value[0]))
      return
    }
    // The form always matches its entry (`editStateOf`); if it ever did not, say so rather than do nothing.
    if (__DEV__) console.warn(`EntryEdit: the ${state.form.kind} form does not fit the ${entry.type} entry ${entry.key}`)
  }

  const unreadName = entry.unsure.includes('name') && entry.name ? entry.name : null

  return (
    <View>
      {entry.unsure.length > 0 ? (
        <Notice title={words.unsureTitle} body={unreadName ? `${words.asWritten(unreadName)} ${words.unsureBody}` : words.unsureBody} />
      ) : null}
      <LinkButton title={words.openPage(entry.page)} align="left" onPress={onOpenPage} />

      {state.form.kind === 'event' && entry.type !== 'medication' ? (
        <EventFields
          draft={state.form.draft}
          species={species}
          today={today}
          errors={eventErrors}
          onChange={(draft) => {
            setEvent(draft)
            setEventErrors({})
          }}
        />
      ) : state.form.kind === 'course' ? (
        <CourseFields
          draft={state.form.draft}
          errors={courseErrors[state.form.draft.key]}
          onChange={(patch) => {
            if (state.form.kind === 'course') setCourse({ ...state.form.draft, ...patch })
            setCourseErrors({})
          }}
        />
      ) : null}
      {entry.type === 'medication' ? (
        <Text variant="caption" tone="faint" style={styles.note}>
          {t.documents.recognition.review.doctorNote}
        </Text>
      ) : null}

      <Text variant="caption" tone="muted" style={styles.note}>
        {words.hint}
      </Text>
      <StateActions>
        <Button title={words.done} onPress={done} />
        <Button title={words.cancel} kind="secondary" onPress={onCancel} />
      </StateActions>
    </View>
  )
}

/** The day and the one item, in the record form's own card: catalogue, chips, next date. */
function EventFields({
  draft,
  species,
  today,
  errors,
  onChange,
}: {
  draft: EventDraft
  species: PetSpecies
  today: string
  errors: DraftErrors
  onChange: (draft: EventDraft) => void
}) {
  const t = useText()
  const words = t.medicalRecord
  const treatment = draft.kind === 'parasite'
  const recordDay = parseDayInput(draft.date, new Date(`${today}T12:00:00`))

  const update = (key: string, next: (item: ItemDraft) => ItemDraft) =>
    onChange({ ...draft, items: draft.items.map((item) => (item.key === key ? next(item) : item)) })

  return (
    <>
      <DateField
        label={words.whenDone}
        value={draft.date}
        onChangeText={(date) => onChange({ ...draft, date })}
        placeholder={words.datePlaceholder}
        max={today}
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
          mode="new"
          treatment={treatment}
          showNext
          recordDay={recordDay}
          error={errors.items?.[item.key]}
          nextError={errors.next?.[item.key]}
          onUpdate={(next) => update(item.key, next)}
        />
      ))}
      {errors.form ? <Banner text={errors.form} tone="error" style={styles.note} /> : null}
    </>
  )
}

const styles = StyleSheet.create({
  heading: { marginTop: space.row, marginBottom: space.row },
  note: { marginTop: space.row },
})
