import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

/**
 * Plain form parts for stage 7. The visual style is transferred in 7/02, so
 * these are deliberately unstyled beyond what makes them usable: a label the
 * field is described by, and a tap target big enough to hit.
 */

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  autoCapitalize,
}: {
  label: string
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  keyboardType?: 'default' | 'numeric'
  multiline?: boolean
  autoCapitalize?: 'none' | 'sentences'
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline ? styles.multiline : null]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        accessibilityLabel={label}
      />
    </View>
  )
}

/**
 * A row of options, one of which may be chosen.
 *
 * Tapping the chosen one clears it when `clearable`, because most of these
 * fields are optional and a person who picked by accident needs a way back to
 * "not stated" — otherwise the only way out is to delete the pet.
 */
export function Choice<Value extends string>({
  label,
  options,
  value,
  onChange,
  clearable = true,
}: {
  label: string
  options: ReadonlyArray<{ value: Value; label: string }>
  value: Value | null
  onChange: (value: Value | null) => void
  clearable?: boolean
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {options.map((option) => {
          const chosen = option.value === value
          return (
            <Pressable
              key={option.value}
              style={[styles.option, chosen ? styles.optionChosen : null]}
              accessibilityRole="button"
              accessibilityState={{ selected: chosen }}
              onPress={() => onChange(chosen && clearable ? null : option.value)}
            >
              <Text style={chosen ? styles.optionTextChosen : styles.optionText}>
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

/** Yes / no / not stated, which a switch cannot express. */
export function Tristate({
  label,
  value,
  onChange,
  yes = 'Да',
  no = 'Нет',
}: {
  label: string
  value: boolean | null
  onChange: (value: boolean | null) => void
  yes?: string
  no?: string
}) {
  return (
    <Choice
      label={label}
      options={[
        { value: 'yes', label: yes },
        { value: 'no', label: no },
      ]}
      value={value === null ? null : value ? 'yes' : 'no'}
      onChange={(next) => onChange(next === null ? null : next === 'yes')}
    />
  )
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  label: { fontSize: 13, color: '#444' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  optionChosen: { borderColor: '#1a1a1a', backgroundColor: '#1a1a1a' },
  optionText: { color: '#1a1a1a' },
  optionTextChosen: { color: '#fff' },
})
