import { useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { LinkButton } from './Button'
import { Field, type FieldHandle } from './Field'
import { space } from './theme'

/**
 * A list typed one item per line, with «+ Ещё» under the last.
 *
 * The form asked for «курица, рыба — через запятую», and people do not think
 * of a list as one line of commas — nor can a medicine's name with a comma in
 * it survive one (first users' feedback, FB-1/06). Empty lines are the form's
 * business: they are kept while typing and dropped when the form is read.
 */
export function ListField({
  label,
  values,
  onChange,
  placeholder,
  hint,
  addLabel,
  removeLabel,
  max,
  autoCapitalize,
}: {
  label: string
  values: readonly string[]
  onChange: (values: string[]) => void
  placeholder?: string
  hint?: string
  addLabel: string
  removeLabel: string
  max: number
  autoCapitalize?: 'none' | 'sentences'
}) {
  // With nothing in it the list is still one line to type into.
  const rows = values.length === 0 ? [''] : values
  const canAdd = rows.length < max && rows[rows.length - 1].trim() !== ''
  const inputs = useRef<(FieldHandle | null)[]>([])
  /** A line «+ Ещё» just added, to put the caret in once it is drawn. */
  const added = useRef<number | null>(null)

  useEffect(() => {
    if (added.current === null) return
    inputs.current[added.current]?.focus()
    added.current = null
  }, [rows.length])

  const set = (index: number, text: string) => onChange(rows.map((row, i) => (i === index ? text : row)))
  const remove = (index: number) => onChange(rows.filter((_, i) => i !== index))
  const add = () => {
    added.current = rows.length
    onChange([...rows, ''])
  }

  return (
    <View style={styles.group}>
      {rows.map((row, index) => {
        const last = index === rows.length - 1
        // A lone empty line has nothing to remove.
        const removable = rows.length > 1 || row !== ''
        return (
          <Field
            key={index}
            label={label}
            labelHidden={index > 0}
            value={row}
            onChangeText={(text) => set(index, text)}
            placeholder={index === 0 ? placeholder : undefined}
            hint={last ? hint : undefined}
            autoCapitalize={autoCapitalize}
            style={last ? styles.lastRow : styles.row}
            fieldRef={(node) => {
              inputs.current[index] = node
            }}
            action={removable ? { icon: 'close', label: `${removeLabel}: ${row || label}`, onPress: () => remove(index) } : undefined}
          />
        )
      })}
      {canAdd ? <LinkButton title={addLabel} align="left" onPress={add} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  group: { marginBottom: space.block },
  row: { marginBottom: 8 },
  lastRow: { marginBottom: 0 },
})
