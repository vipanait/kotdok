import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import type { SafetyPetNote } from '@lapka/contracts'
import { useLocale, useText, type Dictionary } from '@/i18n'
import { Button } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Icon } from '@/ui/Icon'
import { Bullets } from '@/ui/Section'
import { Text } from '@/ui/Text'
import { colour, radius, space } from '@/ui/theme'
import type { SafetyCardModel } from './card-model'
import { checkPrefill } from './to-check'
import { VerdictBadge, VerdictBlock } from './VerdictBadge'

/**
 * The way from the card into a symptom check: with a pet, the check itself
 * (it costs a credit, and says so); with a species picked by hand, adding a
 * pet first — a check is always about one animal.
 */
export type SafetyHandOff = { kind: 'check'; onPress: () => void } | { kind: 'addPet'; onPress: () => void }

/**
 * «Проверить симптомы» opens the check tab with the pet chosen and the
 * description begun; the form decides whether that may replace a draft.
 * Without a pet the check tab's own «add a pet first» takes over, and
 * nothing is handed over.
 */
export function useSafetyHandOff(itemName: string, petId: string | null): SafetyHandOff {
  const locale = useLocale()
  if (!petId) return { kind: 'addPet', onPress: () => router.navigate('/(tabs)/check') }
  return {
    kind: 'check',
    onPress: () =>
      router.navigate({ pathname: '/(tabs)/check', params: { prefill: checkPrefill(itemName, locale), petId } }),
  }
}

function noteText(t: Dictionary, note: SafetyPetNote, pet: string): string {
  return note.kind === 'allergy' ? t.safety.allergy(pet, note.allergy) : t.safety.chronic(pet)
}

/**
 * One answer to «Можно ли?», drawn the same for a reference entry and an AI
 * answer (`card-model`): the AI one carries its badge under the title and no
 * sources, and the reference one says who prepared it. Both end on the app's
 * disclaimer.
 */
export function SafetyCard({
  model,
  forWhom,
  petName,
  handOff,
  onOtherSpecies,
  aiLine,
}: {
  model: SafetyCardModel
  /** «для Рекса (собака)», «для кошек». */
  forWhom: string
  /** The pet the notes and «Если Рекс уже съел» speak of; null for a species. */
  petName: string | null
  handOff: SafetyHandOff | null
  /** Shows the folded species instead of this one. */
  onOtherSpecies?: () => void
  /** Under an AI card: how many AI answers are left today. */
  aiLine?: string
}) {
  const t = useText()
  const label = t.safety.verdict[model.label]
  const urgent = model.ifEaten === 'call_now'

  return (
    <View>
      <Text variant="label" tone="muted" style={styles.forWhom}>
        {forWhom}
      </Text>

      {model.fromAi ? (
        <View style={styles.aiBadge} accessible accessibilityLabel={t.safety.aiBadge}>
          <Icon name="info" size={18} color={colour.muted} />
          <Text variant="label" tone="muted" style={styles.aiBadgeText}>
            {t.safety.aiBadge}
          </Text>
        </View>
      ) : null}

      <VerdictBlock verdict={model.verdict} label={label} summary={model.summary}>
        {model.medicineLine ? (
          <Text variant="bodyStrong" style={styles.medicineLine}>
            {t.safety.medicineLine}
          </Text>
        ) : null}
      </VerdictBlock>

      {petName
        ? model.notes.map((note, index) => (
            <Banner key={`${note.kind}-${index}`} tone="note" icon={note.kind === 'allergy' ? 'alert' : 'info'} text={noteText(t, note, petName)} />
          ))
        : null}

      {model.why ? (
        <View style={styles.section}>
          <Text variant="h3" style={styles.sectionTitle}>
            {t.safety.why}
          </Text>
          <Text tone="muted">{model.why}</Text>
        </View>
      ) : null}

      <Bullets title={t.safety.signs} items={model.signs} />

      {model.ifEaten !== 'none' ? (
        <View style={[styles.ifEaten, urgent ? styles.ifEatenUrgent : null]}>
          <Text variant="h3">{t.safety.ifEaten(petName)}</Text>
          <Text variant="bodyStrong" style={[styles.ifEatenLead, urgent ? { color: colour.danger } : null]}>
            {urgent ? t.safety.callNow : t.safety.watch}
          </Text>
          <Bullets title={t.safety.firstSteps} items={model.firstSteps} />
          <Bullets title={t.safety.avoid} items={model.avoid} />
          {handOff ? (
            <View style={styles.handOff}>
              {handOff.kind === 'check' ? (
                <>
                  {/* Second to the call when every minute counts; the main way on otherwise. */}
                  <Button title={t.safety.checkSymptoms} kind={urgent ? 'secondary' : 'primary'} onPress={handOff.onPress} />
                  <Text variant="caption" tone="faint" center style={styles.cost}>
                    {t.safety.checkCost}
                  </Text>
                </>
              ) : (
                <Button title={t.safety.addPetToCheck} kind="secondary" onPress={handOff.onPress} />
              )}
            </View>
          ) : null}
        </View>
      ) : null}

      {model.otherSpecies ? (
        <Pressable
          accessibilityRole="button"
          onPress={onOtherSpecies}
          disabled={!onOtherSpecies}
          style={({ pressed }) => [styles.other, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={styles.otherText}>{t.safety.otherSpecies[model.otherSpecies.species]}</Text>
          <VerdictBadge
            verdict={model.otherSpecies.verdict}
            label={t.safety.verdict[model.otherSpecies.label]}
          />
          {onOtherSpecies ? <Icon name="chevron" size={20} color={colour.faint} /> : null}
        </Pressable>
      ) : null}

      {model.sources.length > 0 ? (
        <Text variant="caption" tone="faint" style={styles.footnote}>
          {`${t.safety.sources}: ${model.sources.join(', ')}`}
        </Text>
      ) : null}

      {aiLine ? (
        <Text variant="caption" tone="faint" style={styles.footnote}>
          {aiLine}
        </Text>
      ) : null}

      {model.fromAi ? null : (
        <Text variant="caption" tone="faint" style={styles.footnote}>
          {t.safety.preparedByAi}
        </Text>
      )}
      <Text variant="caption" tone="faint" style={styles.footnote}>
        {t.result.disclaimer}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  forWhom: { marginBottom: space.row },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colour.soft,
    marginBottom: space.row,
  },
  aiBadgeText: { flexShrink: 1 },
  medicineLine: { marginTop: space.row },
  section: { marginTop: 4 },
  sectionTitle: { marginBottom: 8 },
  ifEaten: {
    marginTop: 24,
    padding: 16,
    borderRadius: radius.card,
    backgroundColor: colour.surface,
    borderWidth: 1,
    borderColor: colour.line,
  },
  ifEatenUrgent: { borderColor: colour.danger },
  ifEatenLead: { marginTop: 8 },
  handOff: { marginTop: space.block },
  cost: { marginTop: 8 },
  other: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 52,
    marginTop: space.block,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colour.line,
  },
  otherText: { flex: 1 },
  footnote: { marginTop: space.row },
})
