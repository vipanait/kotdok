import { useState } from 'react'
import { Modal, Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import { useText } from '@/i18n'
import {
  dayInput,
  localToday,
  monthGrid,
  monthOf,
  parseDayText,
  shiftMonth,
  type CalendarMonth,
} from '@/lib/calendar-day'
import { IconButton, LinkButton } from './Button'
import { Field, type FieldHandle } from './Field'
import { Text } from './Text'
import { TAP_TARGET, colour, radius, space } from './theme'

/**
 * A day, typed as ДД.ММ.ГГГГ or picked on a calendar.
 *
 * The text stays the field's value either way, so the forms parse and check it
 * exactly as before; the calendar only writes a well-formed day into it. A
 * bound (`min`, `max`, as `YYYY-MM-DD`) greys out the days the form would
 * refuse anyway — a weighing cannot be tomorrow, a plan cannot be yesterday.
 */
export function DateField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  hint,
  min,
  max,
  style,
  fieldRef,
}: {
  label: string
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  error?: string | null
  hint?: string
  min?: string
  max?: string
  style?: ViewStyle
  fieldRef?: (field: FieldHandle | null) => void
}) {
  const t = useText()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Field
        label={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType="numbers-and-punctuation"
        error={error}
        hint={hint}
        style={style}
        fieldRef={fieldRef}
        action={{ icon: 'calendar', label: t.calendar.open, onPress: () => setOpen(true) }}
      />
      <CalendarSheet
        visible={open}
        title={label}
        chosen={parseDayText(value)}
        min={min}
        max={max}
        onClose={() => setOpen(false)}
        onChoose={(day) => {
          onChangeText(dayInput(day))
          setOpen(false)
        }}
      />
    </>
  )
}

/** The month to open on: the chosen day's, else today's, kept inside the bounds. */
function startMonth(chosen: string | null, min?: string, max?: string): CalendarMonth {
  let day = chosen ?? localToday()
  if (min && day < min) day = min
  if (max && day > max) day = max
  return monthOf(day)
}

function CalendarSheet({
  visible,
  title,
  chosen,
  min,
  max,
  onClose,
  onChoose,
}: {
  visible: boolean
  title: string
  chosen: string | null
  min?: string
  max?: string
  onClose: () => void
  onChoose: (day: string) => void
}) {
  const t = useText()
  const [shown, setShown] = useState<CalendarMonth>(() => startMonth(chosen, min, max))
  const today = localToday()
  const allowed = (day: string) => (!min || day >= min) && (!max || day <= max)
  const firstOf = (month: CalendarMonth) => `${month.year}-${String(month.month).padStart(2, '0')}-01`
  // Paging stops at the month that holds the bound, not a month before it.
  const canGoBack = !min || firstOf(shown) > min
  const canGoOn = !max || firstOf(shiftMonth(shown, 1)) <= max

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      // Opens on the day in the field each time, not on the month left last time.
      onShow={() => setShown(startMonth(chosen, min, max))}
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessible={false}>
        <Pressable style={styles.sheet} onPress={() => {}} accessible={false}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text variant="h3" style={styles.title}>
              {title}
            </Text>
            <IconButton icon="close" label={t.common.cancel} onPress={onClose} />
          </View>

          <View style={styles.monthRow}>
            <View style={canGoBack ? null : styles.hidden} pointerEvents={canGoBack ? 'auto' : 'none'}>
              <IconButton icon="back" label={t.calendar.previous} onPress={() => setShown((m) => shiftMonth(m, -1))} />
            </View>
            <Text variant="bodyStrong" accessibilityRole="header" accessibilityLiveRegion="polite">
              {t.calendar.month(shown.year, shown.month)}
            </Text>
            <View style={canGoOn ? null : styles.hidden} pointerEvents={canGoOn ? 'auto' : 'none'}>
              <IconButton icon="chevron" label={t.calendar.next} onPress={() => setShown((m) => shiftMonth(m, 1))} />
            </View>
          </View>

          <View style={styles.week}>
            {t.calendar.weekdays.map((name) => (
              <Text key={name} variant="caption" tone="faint" center style={styles.cell}>
                {name}
              </Text>
            ))}
          </View>

          {monthGrid(shown, t.calendar.weekStartsOn === 'monday' ? 1 : 0).map((week, row) => (
            <View key={row} style={styles.week}>
              {week.map((day, column) => {
                if (!day) return <View key={column} style={styles.cell} />
                const enabled = allowed(day)
                const selected = day === chosen
                return (
                  <Pressable
                    key={day}
                    accessibilityRole="button"
                    accessibilityLabel={t.day(day, true)}
                    accessibilityState={{ selected, disabled: !enabled }}
                    disabled={!enabled}
                    onPress={() => onChoose(day)}
                    style={({ pressed }) => [
                      styles.cell,
                      styles.day,
                      day === today ? styles.today : null,
                      selected ? styles.selected : null,
                      { opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <Text tone={selected ? 'inverse' : enabled ? 'default' : 'faint'} style={enabled ? null : styles.off}>
                      {Number(day.slice(8))}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          ))}

          {allowed(today) ? (
            <LinkButton title={t.calendar.today} align="left" onPress={() => onChoose(today)} />
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  // The same sheet as a select's: see OptionSheet in Field.
  backdrop: { flex: 1, backgroundColor: 'rgba(31,27,21,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colour.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: space.gutter,
    paddingTop: 12,
    paddingBottom: 34,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colour.line,
    borderRadius: radius.pill,
    alignSelf: 'center',
    marginBottom: space.row,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { flex: 1 },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.row,
  },
  hidden: { opacity: 0 },
  week: { flexDirection: 'row', marginBottom: 4 },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  day: { minHeight: TAP_TARGET, borderRadius: radius.pill, borderWidth: 1, borderColor: 'transparent' },
  today: { borderColor: colour.accent },
  selected: { backgroundColor: colour.accent, borderColor: colour.accent },
  // Paler than the faint text around it: a day the form would refuse.
  off: { opacity: 0.45 },
})
