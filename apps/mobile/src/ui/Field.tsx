import { useState } from 'react'
import { Modal, Pressable, StyleSheet, TextInput, View, type ViewStyle } from 'react-native'
import { IconButton } from './Button'
import { Icon } from './Icon'
import { Text } from './Text'
import { CONTROL_HEIGHT, TAP_TARGET, colour, radius, space } from './theme'

/** A field's name, optionally followed by the state of an untouched answer. */
function Label({ children, hint }: { children: string; hint?: string }) {
  return (
    <Text variant="label" tone="muted" style={styles.label}>
      {children}
      {hint ? (
        <Text variant="caption" tone="faint">
          {' · '}
          {hint}
        </Text>
      ) : null}
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
  const [revealed, setRevealed] = useState(false)

  return (
    <View style={[styles.group, style]}>
      <Label>{label}</Label>
      <View
        style={[
          styles.control,
          multiline ? styles.controlMultiline : null,
          secureTextEntry ? styles.controlWithButton : null,
          focused ? styles.focused : null,
          error ? styles.errored : null,
        ]}
      >
        <TextInput
          style={[styles.text, multiline ? styles.textMultiline : null]}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={colour.faint}
          keyboardType={keyboardType ?? 'default'}
          multiline={multiline}
          secureTextEntry={secureTextEntry && !revealed}
          autoCapitalize={autoCapitalize ?? 'sentences'}
          autoComplete={autoComplete}
          accessibilityLabel={label}
        />
        {/* Typing a password blind on a phone keyboard is how people end up
            locked out of an account they know the password to. */}
        {secureTextEntry ? (
          <IconButton
            icon="eye"
            label={revealed ? 'Скрыть пароль' : 'Показать пароль'}
            onPress={() => setRevealed((was) => !was)}
          />
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" tone="danger" style={styles.errorText}>
          {error}
        </Text>
      ) : null}
    </View>
  )
}

export type Option<Value extends string> = { value: Value; label: string }

const NOT_STATED = 'Не указано'

/**
 * Two or three options, all visible.
 *
 * Beyond three the labels stop fitting and the row starts wrapping, which is
 * why `Select` exists — the split is by option count, not by field.
 *
 * Tapping the chosen one clears it when `clearable`, and the label says so
 * while nothing is chosen: most of these are optional, and a person who tapped
 * by accident needs a way back to "not stated".
 */
export function Segment<Value extends string>({
  label,
  options,
  value,
  onChange,
  clearable = true,
}: {
  label: string
  options: ReadonlyArray<Option<Value>>
  value: Value | null
  onChange: (value: Value | null) => void
  clearable?: boolean
}) {
  return (
    <View style={styles.group}>
      <Label hint={clearable && value === null ? NOT_STATED : undefined}>{label}</Label>
      <View style={styles.segment}>
        {options.map((option) => {
          const chosen = option.value === value
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: chosen }}
              onPress={() => onChange(chosen && clearable ? null : option.value)}
              style={[styles.segmentItem, chosen ? styles.segmentChosen : null]}
            >
              <Text variant="segment" tone={chosen ? 'default' : 'muted'} center numberOfLines={2}>
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

/** Four or more options, behind a sheet. */
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
        style={styles.control}
      >
        <Text tone={chosen ? 'default' : 'faint'} style={styles.grow}>
          {chosen?.label ?? NOT_STATED}
        </Text>
        <Icon name="down" size={20} color={colour.faint} />
      </Pressable>

      <OptionSheet
        visible={open}
        title={label}
        options={options}
        value={value}
        onChange={onChange}
        onClose={() => setOpen(false)}
      />
    </View>
  )
}

/**
 * The sheet the choices arrive in, on its own so a row that is not a field can
 * open one too — the language setting is a settings row, not a labelled input.
 *
 * `allowNone` puts "Не указано" first as an ordinary row. Most of these fields
 * are optional and null means the owner does not know, which is not the same as
 * any of the answers and has to be as easy to choose as they are.
 */
export function OptionSheet<Value extends string>({
  visible,
  title,
  options,
  value,
  onChange,
  onClose,
  allowNone = true,
}: {
  visible: boolean
  title: string
  options: ReadonlyArray<Option<Value>>
  value: Value | null
  onChange: (value: Value | null) => void
  onClose: () => void
  allowNone?: boolean
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessible={false}>
        <Pressable style={styles.sheet} onPress={() => {}} accessible={false}>
          <View style={styles.handle} />
          <Text variant="h3" style={styles.sheetTitle}>
            {title}
          </Text>

          {allowNone ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: value === null }}
              style={styles.option}
              onPress={() => {
                onChange(null)
                onClose()
              }}
            >
              <Text tone="faint">{NOT_STATED}</Text>
              {value === null ? <Text tone="accent">✓</Text> : null}
            </Pressable>
          ) : null}

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
                  onClose()
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
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: CONTROL_HEIGHT,
    backgroundColor: colour.surface,
    borderWidth: 1,
    borderColor: colour.line,
    borderRadius: radius.field,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  controlMultiline: { minHeight: 140, alignItems: 'flex-start' },
  controlWithButton: { paddingRight: 4, paddingVertical: 3 },
  text: {
    flex: 1,
    color: colour.text,
    fontFamily: 'Manrope',
    fontSize: 15,
    padding: 0,
  },
  textMultiline: { minHeight: 108, textAlignVertical: 'top' },
  grow: { flex: 1 },
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
