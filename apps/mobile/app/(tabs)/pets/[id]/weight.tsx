import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import type { HealthOverview, WeightMeasurement } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { localToday } from '@/lib/calendar-day'
import { useText, type Dictionary } from '@/i18n'
import { WeightChart } from '@/features/medical-record/WeightChart'
import { WeightSheet } from '@/features/medical-record/WeightSheet'
import { pointsInPeriod, weightTrend, type Period } from '@/features/medical-record/weight'
import { Button } from '@/ui/Button'
import { Banner, Card } from '@/ui/Card'
import { Segment } from '@/ui/Field'
import { Icon } from '@/ui/Icon'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { colour, space } from '@/ui/theme'

const PERIODS: Period[] = ['halfYear', 'year', 'all']

/** «12 сентября 2026», «12 сентября 2026 · из анкеты», «дата не указана · из анкеты». */
function measurementLine(t: Dictionary, weight: WeightMeasurement): string {
  const words = t.medicalRecord
  const day = weight.measured_on ? t.day(weight.measured_on, true) : words.noDate
  return weight.source === 'form' ? `${day} · ${words.fromFormNote}` : day
}

/**
 * The weight history (M10): the current weight and its trend, a chart over a
 * chosen period, and every measurement — the chart's numbers in a list a
 * screen reader can walk.
 */
export default function Weight() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useText()
  const words = t.medicalRecord
  const [overview, setOverview] = useState<HealthOverview | null>(null)
  const [error, setError] = useState<{ text: string; offline: boolean } | null>(null)
  const [period, setPeriod] = useState<Period>('halfYear')
  // Open and what it edits are kept apart, so a closing sheet keeps its title
  // and values while it slides away instead of flipping to «Добавить вес».
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<WeightMeasurement | null>(null)
  const openSheet = (weight: WeightMeasurement | null) => {
    setEditing(weight)
    setSheetOpen(true)
  }

  const load = useCallback(async () => {
    setError(null)
    try {
      setOverview(await withFreshSession((api) => api.getHealthOverview(id)))
    } catch (cause) {
      setError(describeFailure(t, cause, t.errors.loadHealthFailed))
    }
  }, [id, t])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const shown = overview?.pet.id === id ? overview : null
  const today = localToday()
  const weights = shown?.weights ?? []
  const points = pointsInPeriod(weights, period, today)
  const current = shown?.pet.weight_kg ?? null
  const trend = weightTrend(t, weights, today)
  const onlyForm = weights.length === 0 || weights.every((w) => w.measured_on === null)

  // The form's weight with no history behind it is still the pet's weight:
  // the list shows it rather than claiming there is nothing.
  const listed: WeightMeasurement[] =
    weights.length > 0 || current === null
      ? weights
      : [{ id: 'form', measured_on: null, weight_kg: current, source: 'form' }]

  return (
    <Screen
      title={words.weightTitle}
      onBack={() => router.back()}
      action={shown ? { icon: 'plus', label: words.addWeight, onPress: () => openSheet(null) } : undefined}
      scroll
    >
      {error ? (
        <>
          <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} />
          <Button title={t.common.retry} kind="secondary" onPress={() => void load()} />
          <View style={styles.gap} />
        </>
      ) : null}

      {shown ? (
        <>
          <Segment
            label={words.period}
            labelHidden
            options={PERIODS.map((value) => ({ value, label: words.periods[value] }))}
            value={period}
            onChange={(value) => value && setPeriod(value)}
            clearable={false}
          />

          <Card outlined style={styles.summary}>
            {current !== null ? (
              <>
                <Text variant="h1">{words.weight(current)}</Text>
                <Text variant="label" tone="muted">
                  {onlyForm ? words.fromForm : (trend ?? '')}
                </Text>
              </>
            ) : (
              <Text variant="h2">{words.noWeightsTitle}</Text>
            )}
            {points.length >= 2 ? (
              <WeightChart points={points} />
            ) : (
              <Text tone="muted" style={styles.explain}>
                {current === null ? words.noWeightsBody : words.oneMorePoint}
              </Text>
            )}
          </Card>

          {listed.length > 0 ? (
            <>
              <Text variant="h2" style={styles.listTitle}>
                {words.measurements}
              </Text>
              {listed.map((weight, index) => {
                // The form's value without a row is changed in the form, not here.
                const editable = weight.id !== 'form'
                const line = measurementLine(t, weight)
                return (
                  <Pressable
                    key={weight.id}
                    accessibilityRole={editable ? 'button' : undefined}
                    accessibilityLabel={`${words.weight(weight.weight_kg)}, ${line}`}
                    disabled={!editable}
                    onPress={() => openSheet(weight)}
                    style={({ pressed }) => [
                      styles.row,
                      index > 0 ? styles.rowDivider : null,
                      { opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <Icon name="weight" color={colour.accentText} />
                    <View style={styles.rowCopy}>
                      <Text variant="h3">{words.weight(weight.weight_kg)}</Text>
                      <Text variant="label" tone="muted">
                        {line}
                      </Text>
                    </View>
                    {editable ? <Icon name="chevron" size={20} color={colour.faint} /> : null}
                  </Pressable>
                )
              })}
            </>
          ) : null}
        </>
      ) : null}

      <WeightSheet
        petId={id}
        visible={sheetOpen}
        editing={editing}
        onClose={() => setSheetOpen(false)}
        onSaved={() => {
          setSheetOpen(false)
          void load()
        }}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  gap: { height: space.block },
  summary: { padding: space.block, marginBottom: space.section },
  explain: { marginTop: space.row },
  listTitle: { marginBottom: space.row },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 64, paddingVertical: 12 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colour.line },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
})
