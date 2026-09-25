import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import type { HealthOverview } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { useText } from '@/i18n'
import {
  headerFacts,
  importantFacts,
  sectionRows,
  type SectionRow,
} from '@/features/medical-record/overview'
import { Button, LinkButton } from '@/ui/Button'
import { Avatar, Banner, Card, SettingRow } from '@/ui/Card'
import { Icon, type IconName } from '@/ui/Icon'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { colour, radius, shadow, space } from '@/ui/theme'

const SECTION_ICONS: Record<SectionRow['section'], IconName> = {
  vaccinations: 'vaccine',
  parasites: 'parasite',
  visits: 'visit',
  medications: 'med',
  weight: 'weight',
}

/** The shape of the record while it loads: header, one card, the section list. */
function Skeleton() {
  return (
    <View>
      <View style={styles.header}>
        <View style={[styles.blank, styles.blankAvatar]} />
        <View style={styles.headerCopy}>
          <View style={[styles.blank, styles.blankLine]} />
          <View style={[styles.blank, styles.blankWeight]} />
        </View>
      </View>
      <View style={[styles.blank, styles.blankCard]} />
      <View style={[styles.blank, styles.blankSections]} />
    </View>
  )
}

function Section({ row }: { row: SectionRow }) {
  const content = (
    <>
      <Icon name={SECTION_ICONS[row.section]} color={colour.accentText} />
      <View style={styles.sectionCopy}>
        <Text variant="h3">{row.title}</Text>
        <Text variant="label" tone="muted">
          {row.summary}
        </Text>
      </View>
      {row.openable ? <Icon name="chevron" size={20} color={colour.faint} /> : null}
    </>
  )

  // A section whose records cannot be stored yet is a line of text, not a
  // button that leads nowhere.
  if (!row.openable) {
    return (
      <View accessible accessibilityLabel={`${row.title}, ${row.summary}`} style={styles.section}>
        {content}
      </View>
    )
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.title}, ${row.summary}`}
      style={({ pressed }) => [styles.section, { opacity: pressed ? 0.6 : 1 }]}
    >
      {content}
    </Pressable>
  )
}

/**
 * The pet's medical record: what the owner said in the form, and — as the
 * record's stages land — the history behind it. The form keeps its fields and
 * sits one tap away under «Анкета».
 */
export default function MedicalRecord() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useText()
  const [overview, setOverview] = useState<HealthOverview | null>(null)
  const [error, setError] = useState<{ text: string; offline: boolean } | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setOverview(await withFreshSession((api) => api.getHealthOverview(id)))
    } catch (cause) {
      // What was on screen stays there under the banner.
      setError(describeFailure(t, cause, t.errors.loadHealthFailed))
    }
  }, [id, t])

  // On focus, not on mount: coming back from «Анкета» has to show what was saved.
  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  // Only ever this pet's record: a screen reused for another id never shows the previous one.
  const shown = overview?.pet.id === id ? overview : null
  const openForm = () => router.push(`/pets/${id}/edit`)

  const banner = error ? (
    <>
      <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} />
      <Button title={t.common.retry} kind="secondary" onPress={() => void load()} />
      <View style={styles.gap} />
    </>
  ) : null

  const formAction = { label: t.medicalRecord.form, onPress: openForm }
  const history = (
    <SettingRow
      icon="history"
      title={t.pets.history}
      onPress={() => router.push(`/pets/${id}/checks`)}
    />
  )

  if (!shown) {
    // The form, its delete and the check history do not depend on the record:
    // a record that fails to load must not take them with it.
    return (
      <Screen
        title={t.pets.fallbackTitle}
        onBack={() => router.back()}
        action={error ? formAction : undefined}
        scroll
      >
        {banner}
        {error ? (
          <>
            {history}
            <LinkButton title={t.common.toList} onPress={() => router.dismissTo('/pets')} />
          </>
        ) : (
          <Skeleton />
        )}
      </Screen>
    )
  }

  const { pet } = shown
  const facts = headerFacts(t, pet)
  const important = importantFacts(t, pet)

  return (
    <Screen
      title={pet.name}
      onBack={() => router.back()}
      action={formAction}
      scroll
    >
      {banner}

      <View
        style={styles.header}
        accessible
        accessibilityLabel={[facts.meta, facts.neutered, facts.weight].filter(Boolean).join(', ')}
      >
        <Avatar species={pet.species} size={64} />
        <View style={styles.headerCopy}>
          <Text variant="label" tone="muted">
            {facts.meta}
          </Text>
          {facts.neutered ? (
            <Text variant="label" tone="muted">
              {facts.neutered}
            </Text>
          ) : null}
          {facts.weight ? (
            <>
              <Text variant="h2" style={styles.weight}>
                {facts.weight}
              </Text>
              <Text variant="caption" tone="faint">
                {facts.weightNote}
              </Text>
            </>
          ) : null}
        </View>
      </View>

      {important.length > 0 ? (
        <View style={styles.important}>
          <Text variant="h2" style={styles.importantTitle}>
            {t.medicalRecord.important}
          </Text>
          {important.map((fact) => (
            <View key={fact.label} style={styles.fact}>
              <Text variant="label" tone="muted">
                {fact.label}
              </Text>
              <Text>{fact.value}</Text>
            </View>
          ))}
          <LinkButton title={t.medicalRecord.editInForm} onPress={openForm} align="left" />
        </View>
      ) : null}

      <Card style={styles.sections}>
        {sectionRows(t, shown).map((row, index) => (
          <View key={row.section}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <Section row={row} />
          </View>
        ))}
      </Card>

      {history}
    </Screen>
  )
}

const styles = StyleSheet.create({
  gap: { height: space.block },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: space.block },
  headerCopy: { flex: 1, minWidth: 0 },
  weight: { marginTop: 6 },

  important: {
    backgroundColor: colour.soft,
    borderRadius: radius.card,
    padding: space.block,
    marginBottom: space.block,
  },
  importantTitle: { marginBottom: space.row },
  fact: { marginBottom: space.row, gap: 2 },

  sections: { paddingVertical: 4, marginBottom: space.block, ...shadow.card },
  section: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 64, paddingVertical: 12 },
  sectionCopy: { flex: 1, minWidth: 0, gap: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colour.line },

  blank: { backgroundColor: colour.soft, borderRadius: radius.field },
  blankAvatar: { width: 64, height: 64, borderRadius: radius.pill },
  blankLine: { height: 14, width: '60%', marginBottom: 10 },
  blankWeight: { height: 28, width: '40%' },
  blankCard: { height: 120, borderRadius: radius.card, marginBottom: space.block },
  blankSections: { height: 320, borderRadius: radius.card },
})
