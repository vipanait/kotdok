import { useCallback, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import type { VetSummary } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { localToday } from '@/lib/calendar-day'
import { describeFailure } from '@/lib/errors'
import { useText } from '@/i18n'
import { sharePdf } from '@/features/medical-record/share-flow'
import { nativeShare } from '@/features/medical-record/share-summary'
import { summaryHtml } from '@/features/medical-record/summary-html'
import { summaryFileName, summaryView } from '@/features/medical-record/summary-view'
import { WeightChart } from '@/features/medical-record/WeightChart'
import { Button, LinkButton } from '@/ui/Button'
import { Banner, Card, UrgencyBadge } from '@/ui/Card'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { colour, space } from '@/ui/theme'

/**
 * «Для врача» (M11, spec §7.17): made to be turned towards the vet — nothing
 * to tap in the body, large text. «Отправить PDF» hands the same content, as
 * A4, to the system sheet; closing the sheet is not an error.
 */
export default function VetSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useText()
  const words = t.vetSummary
  const [summary, setSummary] = useState<VetSummary | null>(null)
  const [error, setError] = useState<{ text: string; offline: boolean } | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [pdfFailed, setPdfFailed] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      setSummary(await withFreshSession((api) => api.getVetSummary(id)))
    } catch (cause) {
      setError(describeFailure(t, cause, words.loadFailed))
    }
  }, [id, t, words.loadFailed])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const today = localToday()
  const shown = summary?.pet.id === id ? summary : null
  const view = shown ? summaryView(t, shown, today) : null

  async function send() {
    if (!view || preparing) return
    setPreparing(true)
    setPdfFailed(false)
    try {
      await sharePdf(summaryHtml(t, view), summaryFileName(t, view.petName, today), nativeShare)
    } catch {
      setPdfFailed(true)
    } finally {
      setPreparing(false)
    }
  }

  const rows = (columns: readonly string[], table: string[][]) =>
    table.map((row, index) => (
      <View key={index} style={styles.row}>
        <Text variant="h3">{row[0]}</Text>
        {row.slice(1).map((cell, column) =>
          cell && cell !== '—' ? (
            <Text key={column} tone="muted">
              {columns[column + 1]}: {cell}
            </Text>
          ) : null,
        )}
      </View>
    ))

  return (
    <Screen
      title={words.title}
      onBack={() => router.back()}
      scroll
      dock={
        view ? (
          <View style={styles.dock}>
            {pdfFailed ? <Banner text={words.failed} tone="error" icon="alert" /> : null}
            {preparing ? (
              <Text variant="label" tone="muted" style={styles.center} accessibilityLiveRegion="polite">
                {words.preparing}
              </Text>
            ) : null}
            <Button title={preparing ? words.preparing : pdfFailed ? words.retry : words.send} busy={preparing} onPress={() => void send()} />
          </View>
        ) : undefined
      }
    >
      {error ? (
        <>
          <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} style={styles.gap} />
          <LinkButton title={words.retry} align="left" onPress={() => void load()} />
        </>
      ) : !shown ? (
        <ActivityIndicator color={colour.accent} style={styles.loading} />
      ) : null}
      {view && shown ? (
        <>
          <Text variant="h1">{view.petName}</Text>
          {view.pet.lines.map((line) => (
            <Text key={line} style={styles.line}>
              {line}
            </Text>
          ))}

          <Card outlined style={styles.card}>
            <Text variant="h2">{words.important}</Text>
            {view.important.map((fact) => (
              <View key={fact.label} style={styles.row}>
                <Text variant="label" tone="muted">
                  {fact.label}
                </Text>
                <Text>{fact.value}</Text>
              </View>
            ))}
          </Card>

          <Card outlined style={styles.card}>
            <Text variant="h2">{words.vaccinations}</Text>
            {rows(words.vaccinationColumns, view.vaccinations)}
          </Card>

          <Card outlined style={styles.card}>
            <Text variant="h2">{words.parasites}</Text>
            {rows(words.parasiteColumns, view.parasites)}
          </Card>

          <Card outlined style={styles.card}>
            <Text variant="h2">{words.visits}</Text>
            {view.visits.length > 0 ? rows(words.visitColumns, view.visits) : <Text tone="muted">{words.noVisits}</Text>}
          </Card>

          <Card outlined style={styles.card}>
            <Text variant="h2">{words.weight}</Text>
            {view.weights.length > 1 ? (
              <WeightChart points={[...shown.weights].reverse().flatMap((w) => (w.measured_on ? [{ ...w, measured_on: w.measured_on }] : []))} />
            ) : null}
            {view.weights.length > 0 ? (
              view.weights.map(([day, kg]) => (
                <Text key={day} style={styles.line}>
                  {kg} · {day}
                </Text>
              ))
            ) : (
              <Text tone="muted">{words.noWeights}</Text>
            )}
          </Card>

          <Card outlined style={styles.card}>
            <Text variant="h2">{words.checks}</Text>
            {shown.checks.length > 0 ? (
              shown.checks.map((check, index) => (
                <View key={check.id} style={styles.row}>
                  <View style={styles.checkHead}>
                    <UrgencyBadge level={check.urgency} label={view.checks[index][1]} />
                    <Text tone="muted">{view.checks[index][0]}</Text>
                  </View>
                  <Text numberOfLines={1}>{check.summary}</Text>
                </View>
              ))
            ) : (
              <Text tone="muted">{words.noChecks}</Text>
            )}
          </Card>

          <Text variant="label" tone="muted" style={styles.footer}>
            {view.footer}
          </Text>
        </>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  gap: { marginBottom: space.row },
  line: { marginTop: 4 },
  card: { gap: space.row, padding: 16, marginTop: space.block },
  row: { gap: 2 },
  checkHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footer: { marginTop: space.block, marginBottom: space.block },
  dock: { gap: space.row },
  center: { textAlign: 'center' },
  loading: { marginTop: space.section },
})
