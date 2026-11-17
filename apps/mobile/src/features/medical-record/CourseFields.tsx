import { Pressable, StyleSheet, View } from 'react-native'
import { useText } from '@/i18n'
import { IconButton } from '@/ui/Button'
import { DateField } from '@/ui/DateField'
import { Field } from '@/ui/Field'
import { Text } from '@/ui/Text'
import { TAP_TARGET, colour, space } from '@/ui/theme'
import { courseEndsByToday, type CourseDraft, type CourseErrors } from './medications'

/**
 * The fields of one course (M19): its name, «как давать», the start, «Курс
 * продолжается» and the end. The medicine form draws one per course; the
 * edit of a course read from a prescription draws the same (DOC-2), so both
 * ask the same and check by the same rules (`readCourses`).
 */
export function CourseFields({
  draft,
  errors,
  startOptional = false,
  onChange,
  onRemove,
}: {
  draft: CourseDraft
  errors?: CourseErrors[string]
  /** A course whose start nobody knows may keep it empty (shared `startMayStayEmpty`). */
  startOptional?: boolean
  onChange: (patch: Partial<CourseDraft>) => void
  /** Absent while the form has only this course. */
  onRemove?: () => void
}) {
  const t = useText()
  const words = t.medicalRecord.meds
  return (
    <>
      <View style={styles.head}>
        <View style={styles.fill}>
          <Field
            label={words.name}
            value={draft.name}
            onChangeText={(name) => onChange({ name })}
            placeholder={words.namePlaceholder}
            autoCorrect={false}
            error={errors?.name}
          />
        </View>
        {onRemove ? <IconButton icon="close" label={words.remove} onPress={onRemove} /> : null}
      </View>
      <Field
        label={words.dosage}
        value={draft.dosage}
        onChangeText={(dosage) => onChange({ dosage })}
        placeholder={words.dosagePlaceholder}
        error={errors?.dosage}
      />
      <DateField
        label={words.start}
        value={draft.start}
        onChangeText={(start) => onChange({ start })}
        placeholder={t.medicalRecord.datePlaceholder}
        error={errors?.start}
        hint={startOptional ? words.startUnknownHint : undefined}
      />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: draft.ongoing }}
        accessibilityLabel={words.ongoing}
        onPress={() => onChange({ ongoing: !draft.ongoing, end: '' })}
        style={styles.toggle}
      >
        <Text style={styles.fill}>{words.ongoing}</Text>
        <View style={[styles.box, draft.ongoing ? styles.boxOn : null]}>
          {draft.ongoing ? <Text style={styles.tick}>✓</Text> : null}
        </View>
      </Pressable>
      {!draft.ongoing ? (
        <DateField
          label={words.end}
          value={draft.end}
          onChangeText={(end) => onChange({ end })}
          placeholder={t.medicalRecord.datePlaceholder}
          error={errors?.end}
          hint={courseEndsByToday(draft) ? words.endsNow : undefined}
        />
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
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
})
