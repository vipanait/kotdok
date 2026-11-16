import { Linking, Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import type { PetSpecies, SafetyPetNote } from '@lapka/contracts'
import { useLocale, useText, type Dictionary } from '@/i18n'
import { Button } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Icon } from '@/ui/Icon'
import { Text } from '@/ui/Text'
import { colour, radius, space, urgency } from '@/ui/theme'
import { cardBlocks, type SafetyCardModel } from './card-model'
import { SafetyAboutLink } from './SafetyFootnote'
import { SafetyPanel } from './SafetyParts'
import { checkPrefill } from './to-check'
import { VerdictBadge, VerdictBlock } from './VerdictBadge'

/**
 * The way from the card into a symptom check: with a pet, the check itself
 * (what it costs is for the check form and the balance to say); with a
 * species picked by hand, adding a pet first — a check is always about one
 * animal.
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

/** Short statements on bullets, without a heading of their own. */
function BulletList({ items }: { items: readonly string[] }) {
  return (
    <View style={styles.list}>
      {items.map((item, index) => (
        <View key={`${index}-${item.slice(0, 16)}`} style={styles.bullet}>
          <Text style={styles.dot}>•</Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  )
}

/**
 * One answer to «Можно ли?», drawn the same for a reference entry and an AI
 * answer (`card-model`), in the order `cardBlocks` gives (pet-safety-v1
 * handoff §7): an allergy before the verdict, what to do if it was eaten
 * before why. The AI card carries its badge above the verdict and has no
 * sources; the reference card's sources lead to how it was prepared.
 */
export function SafetyCard({
  model,
  species,
  petName,
  handOff,
  onOtherSpecies,
  onRefine,
  aiLine,
}: {
  model: SafetyCardModel
  /** The species the verdict is for: «Собакам» over it. */
  species: PetSpecies
  /** The pet the notes and «Если Рекс уже съел» speak of; null for a species. */
  petName: string | null
  handOff: SafetyHandOff | null
  /** Shows the folded species instead of this one. */
  onOtherSpecies?: () => void
  /** Under an AI «no data»: back to the search to name it more exactly. */
  onRefine?: () => void
  /** Under an AI card: how many AI answers are left today. */
  aiLine?: string
}) {
  const t = useText()
  const label = t.safety.verdict[model.label]
  const urgent = model.ifEaten === 'call_now'
  const notes = petName ? model.notes : []

  const block = (kind: ReturnType<typeof cardBlocks>[number]) => {
    switch (kind) {
      case 'allergy':
        return (
          <View key={kind} style={styles.allergy}>
            <Text variant="bodyStrong" accessibilityRole="header" style={styles.allergyText}>
              {t.safety.allergyTitle}
            </Text>
            {notes
              .filter((note) => note.kind === 'allergy')
              .map((note, index) => (
                <Text key={index} style={styles.allergyText}>
                  {`${noteText(t, note, petName ?? '')}. ${t.safety.allergyKeep}`}
                </Text>
              ))}
          </View>
        )
      case 'verdict':
        return (
          <VerdictBlock key={kind} verdict={model.verdict} label={label} summary={model.summary} forWhom={t.safety.verdictFor[species]}>
            {model.medicineLine ? (
              <Text variant="bodyStrong" style={styles.medicineLine}>
                {t.safety.medicineLine}
              </Text>
            ) : null}
          </VerdictBlock>
        )
      case 'chronic':
        return notes
          .filter((note) => note.kind === 'chronic')
          .map((note, index) => (
            <Banner key={`chronic-${index}`} tone="note" icon="info" text={noteText(t, note, petName ?? '')} style={styles.chronic} />
          ))
      case 'ifEaten':
        return (
          <SafetyPanel key={kind} style={urgent ? styles.urgent : null}>
            <Text variant="h2" accessibilityRole="header" style={urgent ? styles.urgentText : null}>
              {t.safety.ifEaten(petName)}
            </Text>
            <Text variant="bodyStrong" style={[styles.lead, urgent ? styles.urgentText : null]}>
              {urgent ? t.safety.callNow : t.safety.watch}
            </Text>
            {model.firstSteps.length > 0 ? (
              <>
                <Text variant="h3" style={styles.subTitle}>
                  {t.safety.firstSteps}
                </Text>
                <BulletList items={model.firstSteps} />
              </>
            ) : null}
            {model.avoid.length > 0 ? (
              <>
                <Text variant="h3" style={styles.subTitle}>
                  {t.safety.avoid}
                </Text>
                <BulletList items={model.avoid} />
              </>
            ) : null}
            {handOff ? (
              <View style={styles.handOff}>
                {handOff.kind === 'check' ? (
                  // Second to the call when every minute counts; the main way on otherwise. No line about
                  // the credit here (owner, 2026-11-15): the check form and the balance say what they always did.
                  <Button title={t.safety.checkSymptoms} kind={urgent ? 'secondary' : 'primary'} onPress={handOff.onPress} />
                ) : (
                  <Button title={t.safety.addPetToCheck} kind="secondary" onPress={handOff.onPress} />
                )}
              </View>
            ) : null}
          </SafetyPanel>
        )
      case 'refine':
        return (
          <SafetyPanel key={kind}>
            <Text variant="h3">{t.safety.refineTitle}</Text>
            <Text tone="muted" style={styles.lead}>
              {t.safety.refineBody}
            </Text>
            {onRefine ? <Button title={t.safety.refine} kind="secondary" onPress={onRefine} style={styles.handOff} /> : null}
          </SafetyPanel>
        )
      case 'why':
        return (
          <SafetyPanel key={kind}>
            <Text variant="h2" accessibilityRole="header">
              {t.safety.why}
            </Text>
            <Text style={styles.lead}>{model.why}</Text>
          </SafetyPanel>
        )
      case 'signs':
        return (
          <SafetyPanel key={kind}>
            <Text variant="h2" accessibilityRole="header">
              {t.safety.signs}
            </Text>
            <BulletList items={model.signs} />
          </SafetyPanel>
        )
      case 'otherSpecies': {
        const other = model.otherSpecies
        if (!other) return null
        const otherLabel = t.safety.verdict[other.label]
        return (
          <Pressable
            key={kind}
            accessibilityRole="button"
            accessibilityLabel={`${t.safety.otherSpecies[other.species]} ${otherLabel}`}
            onPress={onOtherSpecies}
            disabled={!onOtherSpecies}
            style={({ pressed }) => [styles.other, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={styles.otherText}>{t.safety.otherSpecies[other.species]}</Text>
            <VerdictBadge verdict={other.verdict} label={otherLabel} />
            {onOtherSpecies ? <Icon name="chevron" size={20} color={colour.faint} /> : null}
          </Pressable>
        )
      }
      case 'sources':
        return (
          <SafetyPanel key={kind}>
            <Text variant="h2" accessibilityRole="header">
              {t.safety.sources}
            </Text>
            <View style={styles.sources}>
              {model.sources.map((source, index) =>
                source.url ? (
                  <Pressable
                    key={index}
                    accessibilityRole="link"
                    accessibilityLabel={source.title}
                    // No handler for the link (a restricted device): nothing to open, nothing to report.
                    onPress={() => void Linking.openURL(source.url as string).catch(() => {})}
                    style={({ pressed }) => [styles.source, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    {/* The arrow as text, not Apple's emoji: U+FE0E asks for the text form. */}
                    <Text tone="accent">{`${source.title} \u2197\uFE0E`}</Text>
                  </Pressable>
                ) : (
                  <Text key={index} style={styles.source}>
                    {source.title}
                  </Text>
                ),
              )}
            </View>
            {model.fromAi ? null : <SafetyAboutLink label={t.safety.howPrepared} />}
          </SafetyPanel>
        )
    }
  }

  return (
    <View>
      {model.fromAi ? (
        <View style={styles.aiBadge} accessible accessibilityLabel={t.safety.aiBadge}>
          <Icon name="info" size={16} color={colour.muted} />
          <Text variant="caption" tone="muted" style={styles.aiBadgeText}>
            {t.safety.aiBadge}
          </Text>
        </View>
      ) : null}

      {cardBlocks(model, petName).map(block)}

      {aiLine ? (
        <Text variant="caption" tone="faint" style={styles.aiLine}>
          {aiLine}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colour.soft,
    marginBottom: 16,
  },
  aiBadgeText: { flexShrink: 1 },
  allergy: { padding: 16, marginBottom: 16, borderRadius: radius.field, backgroundColor: urgency.monitor.background, gap: 2 },
  allergyText: { color: urgency.monitor.signal },
  medicineLine: { marginTop: space.row },
  chronic: { marginBottom: 16 },
  urgent: { borderColor: urgency.emergency.signal, borderLeftWidth: 5 },
  urgentText: { color: urgency.emergency.signal },
  lead: { marginTop: 8 },
  subTitle: { marginTop: 16 },
  list: { marginTop: 8 },
  bullet: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  dot: { width: 10 },
  bulletText: { flex: 1 },
  handOff: { marginTop: 16 },
  other: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 52,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colour.line,
    backgroundColor: colour.surface,
  },
  otherText: { flex: 1 },
  sources: { marginTop: 8, marginBottom: 4 },
  source: { minHeight: 44, justifyContent: 'center', paddingVertical: 6 },
  aiLine: { marginTop: 4 },
})
