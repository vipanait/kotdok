import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import type { Pet, PetSpecies } from '@lapka/contracts'
import { useText } from '@/i18n'
import { Avatar } from '@/ui/Card'
import { OptionSheet, Segment } from '@/ui/Field'
import { Icon } from '@/ui/Icon'
import { Text } from '@/ui/Text'
import { colour, radius, space, TAP_TARGET } from '@/ui/theme'
import { subjectOfPet, type SafetySubject } from './subject'

/**
 * Whom the answer is for. With pets, the chosen one in a pill that opens the
 * list (one pet: just its name, nothing to choose). Without, «Кошка | Собака».
 */
export function SafetySubjectPicker({
  pets,
  subject,
  onChange,
}: {
  pets: readonly Pet[]
  subject: SafetySubject
  onChange: (subject: SafetySubject) => void
}) {
  const t = useText()
  const [open, setOpen] = useState(false)

  if (subject.kind === 'species' || pets.length === 0) {
    return (
      <Segment<PetSpecies>
        label={t.safety.subject}
        labelHidden
        clearable={false}
        options={[
          { value: 'cat', label: t.safety.speciesSwitch.cat },
          { value: 'dog', label: t.safety.speciesSwitch.dog },
        ]}
        value={subject.species}
        onChange={(species) => {
          if (species) onChange({ kind: 'species', species })
        }}
      />
    )
  }

  const pet = pets.find((one) => one.id === subject.petId)
  const several = pets.length > 1

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t.safety.subject}: ${subject.name}`}
        accessibilityHint={several ? t.safety.choosePet : undefined}
        disabled={!several}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.pill, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Avatar species={subject.species} size={28} uri={pet?.avatar_url ?? null} />
        <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>
          {subject.name}
        </Text>
        {several ? <Icon name="down" size={18} color={colour.faint} /> : null}
      </Pressable>
      <OptionSheet
        visible={open}
        title={t.safety.choosePet}
        allowNone={false}
        options={pets.map((one) => ({ value: one.id, label: one.name }))}
        value={subject.petId}
        onChange={(id) => {
          const chosen = pets.find((one) => one.id === id)
          if (chosen) onChange(subjectOfPet(chosen))
        }}
        onClose={() => setOpen(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: space.row },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: TAP_TARGET,
    paddingLeft: 6,
    paddingRight: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colour.line,
    backgroundColor: colour.surface,
    maxWidth: '100%',
  },
  name: { flexShrink: 1 },
})
