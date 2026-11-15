import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import type { Pet, PetSpecies } from '@lapka/contracts'
import { useText } from '@/i18n'
import { Avatar } from '@/ui/Card'
import { OptionSheet, Segment } from '@/ui/Field'
import { Icon } from '@/ui/Icon'
import { Text } from '@/ui/Text'
import { colour, space, TAP_TARGET } from '@/ui/theme'
import { subjectLine } from './SafetyParts'
import { subjectOfPet, type SafetySubject } from './subject'

/**
 * Whom the answer is for («Для кого смотрим»). With pets, the chosen one in a
 * card that opens the list (one pet: just its name, nothing to choose).
 * Without, «Кошка | Собака».
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
    // No pet to name or draw: a choice of the two species, under the same caption — no invented pet.
    return (
      <View style={styles.species}>
        <Text variant="caption" tone="muted" style={styles.speciesLabel}>
          {t.safety.subject}
        </Text>
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
      </View>
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
        style={({ pressed }) => [styles.card, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Avatar species={subject.species} size={38} uri={pet?.avatar_url ?? null} />
        <View style={styles.text}>
          <Text variant="caption" tone="muted">
            {t.safety.subject}
          </Text>
          <Text variant="bodyStrong" numberOfLines={2}>
            {subjectLine(t, subject.species, subject.name)}
          </Text>
        </View>
        {several ? <Icon name="down" size={20} color={colour.text} /> : null}
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
  row: { marginBottom: space.block },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: Math.max(TAP_TARGET, 64),
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colour.line,
    backgroundColor: colour.surface,
  },
  text: { flex: 1 },
  species: { marginBottom: 8 },
  speciesLabel: { marginBottom: 6 },
})
