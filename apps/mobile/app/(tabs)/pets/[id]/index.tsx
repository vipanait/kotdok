import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import type { HealthOverview } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { localToday } from '@/lib/calendar-day'
import { describeFailure } from '@/lib/errors'
import { useText } from '@/i18n'
import {
  headerFacts,
  importantFacts,
  sectionRows,
  type SectionRow,
} from '@/features/medical-record/overview'
import { AddRecordSheet, type AddChoice } from '@/features/medical-record/AddRecordSheet'
import { DueRow } from '@/features/medical-record/DueRow'
import { dueItems, dueStatus } from '@/features/medical-record/due'
import { Button, IconButton, LinkButton } from '@/ui/Button'
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

/** Where an openable section leads. Each stage adds its own. */
const SECTION_ROUTES: Partial<Record<SectionRow['section'], string>> = {
  vaccinations: 'vaccinations',
  parasites: 'parasites',
  medications: 'medications',
  weight: 'weight',
}

/** At most this many due dates on the record itself; the rest behind «Все сроки» (spec §7.2). */
const DUE_ON_RECORD = 3

/** Where «Скрыть подсказку» is remembered, per pet and per phone. */
const hintKey = (petId: string) => `medical-record-hint-hidden-${petId}`

function Section({ row, onPress }: { row: SectionRow; onPress: () => void }) {
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
      onPress={onPress}
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

  const [hintHidden, setHintHidden] = useState(true)
  const [adding, setAdding] = useState(false)

  // Hidden until the phone says otherwise: a hint that flashes up and vanishes
  // is worse than one that appears a moment late.
  useEffect(() => {
    SecureStore.getItemAsync(hintKey(id))
      .then((value) => setHintHidden(value === '1'))
      .catch(() => setHintHidden(false))
  }, [id])

  const hideHint = () => {
    setHintHidden(true)
    SecureStore.setItemAsync(hintKey(id), '1').catch(() => {})
  }

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
  const today = localToday()
  const facts = headerFacts(t, shown, today)
  const important = importantFacts(t, pet, shown.medications, today)
  const due = dueItems(shown.events)
  const canVaccinate = shown.writable.includes('vaccinations')
  const empty = shown.events.length === 0 && shown.weights.length === 0 && shown.medications.length === 0
  const addVaccination = () => router.push(`/pets/${id}/event-form?mode=new&status=done`)
  const choices: AddChoice[] = [
    ...(canVaccinate
      ? [{ key: 'vaccination', icon: 'vaccine' as const, label: t.medicalRecord.addVaccinationRow, onPress: addVaccination }]
      : []),
    ...(shown.writable.includes('parasites')
      ? [
          {
            key: 'parasite',
            icon: 'parasite' as const,
            label: t.medicalRecord.addTreatmentRow,
            onPress: () => router.push(`/pets/${id}/event-form?mode=new&status=done&kind=parasite`),
          },
        ]
      : []),
    ...(shown.writable.includes('medications')
      ? [{ key: 'medication', icon: 'med' as const, label: t.medicalRecord.meds.addRow, onPress: () => router.push(`/pets/${id}/medication-form`) }]
      : []),
    ...(shown.writable.includes('weight')
      ? [{ key: 'weight', icon: 'weight' as const, label: t.medicalRecord.addWeightRow, onPress: () => router.push(`/pets/${id}/weight`) }]
      : []),
  ]

  return (
    <Screen
      title={pet.name}
      onBack={() => router.back()}
      action={formAction}
      scroll
      dock={
        choices.length > 0 ? (
          <Button title={t.medicalRecord.addRecord} onPress={() => setAdding(true)} />
        ) : null
      }
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

      {empty && canVaccinate && !hintHidden ? (
        <View style={styles.hint}>
          <View style={styles.hintCopy}>
            <Text tone="accent">{t.medicalRecord.firstFillBanner}</Text>
            <LinkButton title={t.medicalRecord.firstFillAction} onPress={addVaccination} align="left" />
          </View>
          <IconButton icon="close" label={t.medicalRecord.hideBanner} onPress={hideHint} />
        </View>
      ) : null}

      {due.length > 0 ? (
        <Card style={styles.due}>
          <Text variant="h2">{t.medicalRecord.dueTitle}</Text>
          {due.slice(0, DUE_ON_RECORD).map((item, index) => (
            <View key={item.itemId} style={index > 0 ? styles.rowDivider : null}>
              <DueRow
                due={item}
                status={dueStatus(t, item.date, today)}
                onDone={() => router.push(`/pets/${id}/event-form?mode=complete&itemId=${item.itemId}&kind=${item.kind}`)}
              />
            </View>
          ))}
          {due.length > DUE_ON_RECORD ? (
            <LinkButton
              title={t.medicalRecord.allDue(due.length)}
              align="left"
              onPress={() => router.push(`/pets/${id}/due`)}
            />
          ) : null}
        </Card>
      ) : null}

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
        {sectionRows(t, shown, today).map((row, index) => (
          <View key={row.section}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <Section
              row={row}
              onPress={() => {
                const route = SECTION_ROUTES[row.section]
                if (route) router.push(`/pets/${id}/${route}`)
              }}
            />
          </View>
        ))}
      </Card>

      {history}

      <AddRecordSheet visible={adding} choices={choices} onClose={() => setAdding(false)} />
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

  hint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colour.accentSoft,
    borderRadius: radius.card,
    padding: 16,
    marginBottom: space.block,
  },
  hintCopy: { flex: 1 },
  due: { paddingVertical: 16, marginBottom: space.block, ...shadow.card },
  sections: { paddingVertical: 4, marginBottom: space.block, ...shadow.card },
  section: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 64, paddingVertical: 12 },
  sectionCopy: { flex: 1, minWidth: 0, gap: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colour.line },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colour.line },

  blank: { backgroundColor: colour.soft, borderRadius: radius.field },
  blankAvatar: { width: 64, height: 64, borderRadius: radius.pill },
  blankLine: { height: 14, width: '60%', marginBottom: 10 },
  blankWeight: { height: 28, width: '40%' },
  blankCard: { height: 120, borderRadius: radius.card, marginBottom: space.block },
  blankSections: { height: 320, borderRadius: radius.card },
})
