import { useState } from 'react'
import { Modal, Pressable, StyleSheet, TextInput, View, type ViewStyle } from 'react-native'
import { Text } from './Text'
import { CONTROL_HEIGHT, TAP_TARGET, colour, radius, space } from './theme'

function Label({ children }: { children: string }) {
  return (
    <Text variant="label" tone="muted" style={styles.label}>
      {children}
    </Text>
  )
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  keyboardType,
  multiline,
  secureTextEntry,
  autoCapitalize,
  autoComplete,
  style,
}: {
  label: string
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  error?: string | null
  keyboardType?: 'default' | 'numeric' | 'email-address'
  multiline?: boolean
  secureTextEntry?: boolean
  autoCapitalize?: 'none' | 'sentences'
  autoComplete?: 'email' | 'password' | 'off'
  style?: ViewStyle
}) {
  const [focused, setFocused] = useState(false)

  return (
    <View style={[styles.group, style]}>
      <Label>{label}</Label>
      <TextInput
        style={[
          styles.input,
          multiline ? styles.multiline : null,
          focused ? styles.focused : null,
          error ? styles.errored : null,
        ]}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={colour.faint}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        autoComplete={autoComplete}
        accessibilityLabel={label}
      />
      {error ? (
        <Text variant="caption" tone="danger" style={styles.errorText}>
          {error}
        </Text>
      ) : null}
    </View>
  )
}

export type Option<Value extends string> = { value: Value; label: string }

/**
 * Two or three options, all visible.
 *
 * Beyond three the labels stop fitting and the row starts wrapping, which is
 * why `Select` exists — the split is by option count, not by field.
 */
export function Segment<Value extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: ReadonlyArray<Option<Value>>
  value: Value | null
  onChange: (value: Value) => void
}) {
  return (
    <View style={styles.group}>
      <Label>{label}</Label>
      <View style={styles.segment}>
        {options.map((option) => {
          const chosen = option.value === value
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: chosen }}
              onPress={() => onChange(option.value)}
              style={[styles.segmentItem, chosen ? styles.segmentChosen : null]}
            >
              <Text
                variant="segment"
                tone={chosen ? 'default' : 'muted'}
                center
                numberOfLines={2}
              >
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const NOT_STATED = 'Не указано'

/**
 * Four or more options, behind a sheet.
 *
 * The sheet always offers "Не указано" as an ordinary first row. Most of these
 * fields are optional and null means the owner does not know — which is not the
 * same as any of the answers, and has to be as easy to choose as they are.
 */
export function Select<Value extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: ReadonlyArray<Option<Value>>
  value: Value | null
  onChange: (value: Value | null) => void
}) {
  const [open, setOpen] = useState(false)
  const chosen = options.find((option) => option.value === value)

  return (
    <View style={styles.group}>
      <Label>{label}</Label>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${chosen?.label ?? NOT_STATED}`}
        onPress={() => setOpen(true)}
        style={styles.input}
      >
        <Text tone={chosen ? 'default' : 'faint'}>{chosen?.label ?? NOT_STATED}</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessible={false}>
          <Pressable style={styles.sheet} onPress={() => {}} accessible={false}>
            <View style={styles.handle} />
            <Text variant="h3" style={styles.sheetTitle}>
              {label}
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: value === null }}
              style={styles.option}
              onPress={() => {
                onChange(null)
                setOpen(false)
              }}
            >
              <Text tone="faint">{NOT_STATED}</Text>
              {value === null ? <Text tone="accent">✓</Text> : null}
            </Pressable>

            {options.map((option) => {
              const selected = option.value === value
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={styles.option}
                  onPress={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  <Text variant={selected ? 'bodyStrong' : 'body'}>{option.label}</Text>
                  {selected ? <Text tone="accent">✓</Text> : null}
                </Pressable>
              )
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

/** Several answers at once, so these are checkboxes and not a segment. */
export function Chips<Value extends string>({
  label,
  options,
  values,
  onToggle,
}: {
  label: string
  options: ReadonlyArray<Option<Value>>
  values: readonly Value[]
  onToggle: (value: Value) => void
}) {
  return (
    <View style={styles.group}>
      <Label>{label}</Label>
      <View style={styles.chips}>
        {options.map((option) => {
          const chosen = values.includes(option.value)
          return (
            <Pressable
              key={option.value}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: chosen }}
              onPress={() => onToggle(option.value)}
              style={[styles.chip, chosen ? styles.chipChosen : null]}
            >
              <Text tone={chosen ? 'accent' : 'default'}>
                {chosen ? '✓ ' : ''}
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  group: { marginBottom: space.block },
  label: { marginBottom: 6 },
  input: {
    minHeight: CONTROL_HEIGHT,
    backgroundColor: colour.surface,
    borderWidth: 1,
    borderColor: colour.line,
    borderRadius: radius.field,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colour.text,
    fontFamily: 'Manrope',
    fontSize: 15,
    justifyContent: 'center',
  },
  multiline: { minHeight: 140, textAlignVertical: 'top' },
  focused: { borderColor: colour.accent },
  errored: { borderColor: colour.danger },
  errorText: { marginTop: 6 },

  segment: {
    flexDirection: 'row',
    gap: 3,
    padding: 3,
    backgroundColor: colour.soft,
    borderRadius: radius.field,
    minHeight: CONTROL_HEIGHT,
  },
  segmentItem: {
    flex: 1,
    minHeight: TAP_TARGET,
    borderRadius: 11,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentChosen: { backgroundColor: colour.surface },

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
    marginBottom: space.block,
  },
  sheetTitle: { marginBottom: space.block },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: CONTROL_HEIGHT,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colour.line,
  },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: TAP_TARGET,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colour.line,
    borderRadius: radius.pill,
    backgroundColor: colour.surface,
  },
  chipChosen: { borderColor: colour.accent, backgroundColor: colour.accentSoft },
})
