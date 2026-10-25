import { Pressable, StyleSheet, View } from 'react-native'
import { useText } from '@/i18n'
import { IconButton } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { Field, type FieldHandle } from '@/ui/Field'
import { Text } from '@/ui/Text'
import { TAP_TARGET, colour } from '@/ui/theme'
import type { PrescriptionDraft } from './visits'

/**
 * One prescription of a visit that happened: what, how to take it, and — for
 * a new one — whether it goes to the medicines. One already there says so.
 */
export function PrescriptionCard({
  item,
  nameError,
  instructionsError,
  fieldRef,
  onChange,
  onRemove,
}: {
  item: PrescriptionDraft
  nameError?: string
  instructionsError?: string
  /** Binds the card's inputs under `firstVisitError`'s names. */
  fieldRef: (field: string) => (node: FieldHandle | null) => void
  onChange: (patch: Partial<PrescriptionDraft>) => void
  onRemove: () => void
}) {
  const words = useText().medicalRecord.visits
  return (
    <Card outlined style={styles.card}>
      <View style={styles.head}>
        <View style={styles.fill}>
          <Field
            label={words.prescription}
            value={item.name}
            onChangeText={(name) => onChange({ name })}
            autoCorrect={false}
            error={nameError}
            fieldRef={fieldRef(`prescription:${item.key}`)}
          />
        </View>
        <IconButton icon="close" label={words.removePrescription} onPress={onRemove} />
      </View>
      <Field
        label={words.instructions}
        value={item.instructions}
        onChangeText={(instructions) => onChange({ instructions })}
        error={instructionsError}
        fieldRef={fieldRef(`instructions:${item.key}`)}
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
          onPress={() => onChange({ toMedicines: !item.toMedicines })}
          style={styles.toggle}
        >
          <Text style={styles.fill}>{words.toMedicines}</Text>
          <View style={[styles.box, item.toMedicines ? styles.boxOn : null]}>
            {item.toMedicines ? <Text style={styles.tick}>✓</Text> : null}
          </View>
        </Pressable>
      ) : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  fill: { flex: 1 },
  toggle: { flexDirection: 'row', alignItems: 'center', minHeight: TAP_TARGET },
  box: { width: 28, height: 28, borderRadius: 6, borderWidth: 2, borderColor: colour.line, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colour.accent, borderColor: colour.accent },
  tick: { color: colour.surface, fontWeight: '700' },
})
