import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import type { HealthEvent } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { localToday } from '@/lib/calendar-day'
import { useText } from '@/i18n'
import { dueLine, dueStatus } from '@/features/medical-record/due'
import { Button, LinkButton } from '@/ui/Button'
import { Banner, Card, SettingRow } from '@/ui/Card'
import { ConfirmDialog } from '@/ui/Dialog'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { colour, space } from '@/ui/theme'

/**
 * One visit (X-visit-record, X-visit-plan). A plan is marked «Был», moved or
 * cancelled; a visit that happened is corrected or deleted. A prescription not
 * yet in the medicines can be added from here.
 */
export default function VisitView() {
  const { id, eventId } = useLocalSearchParams<{ id: string; eventId: string }>()
  const t = useText()
  const words = t.medicalRecord.visits
  const [visit, setVisit] = useState<HealthEvent | null>(null)
  const [error, setError] = useState<{ text: string; offline: boolean } | null>(null)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const overview = await withFreshSession((api) => api.getHealthOverview(id))
      const found = overview.events.find((event) => event.id === eventId && event.kind === 'visit')
      if (!found) {
        router.back()
        return
      }
      setVisit(found)
    } catch (cause) {
      setError(describeFailure(t, cause, t.medicalRecord.loadEventFailed))
    }
  }, [id, eventId, t])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  async function toMedicines(itemId: string) {
    setBusy(true)
    try {
      await withFreshSession((api) => api.prescriptionToMedication(id, itemId))
      await load()
    } catch (cause) {
      setError(describeFailure(t, cause, t.medicalRecord.saveEventFailed))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await withFreshSession((api) => api.deleteHealthEvent(id, eventId))
      setAsking(false)
      router.back()
    } catch (cause) {
      setAsking(false)
      setError(describeFailure(t, cause, t.medicalRecord.deleteEventFailed))
    } finally {
      setBusy(false)
    }
  }

  const planned = visit?.status === 'planned'
  const status = visit && planned ? dueStatus(t, visit.date, localToday()) : null
  const edit = (mode: 'edit' | 'done') => router.push(`/pets/${id}/visit-form?mode=${mode}&eventId=${eventId}`)

  return (
    <Screen
      title={words.viewTitle}
      onBack={() => router.back()}
      scroll
      dock={
        visit ? (
          planned ? (
            <>
              <Button title={words.markDone} onPress={() => edit('done')} />
              <LinkButton title={t.medicalRecord.reschedule} onPress={() => edit('edit')} />
            </>
          ) : (
            <Button title={t.medicalRecord.edit} onPress={() => edit('edit')} />
          )
        ) : null
      }
    >
      {error ? <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} style={styles.gap} /> : null}
      {visit ? (
        <>
          <Card outlined style={styles.card}>
            <Text variant="h2">{t.day(visit.date, true)}</Text>
            <Text tone="muted">{[visit.visit_kind ? words.kindsShort[visit.visit_kind] : null, visit.clinic].filter(Boolean).join(' · ')}</Text>
            {status && status.tone !== 'later' ? (
              <Text variant="label" style={{ color: status.tone === 'overdue' ? colour.text : colour.accentText, fontWeight: '600' }}>
                {dueLine(status)}
              </Text>
            ) : null}
          </Card>

          {visit.reason || visit.diagnosis || visit.items.length > 0 ? (
            <Card outlined style={styles.card}>
              {visit.reason ? (
                <View style={styles.block}>
                  <Text variant="h3">{words.reason.split(' ·')[0]}</Text>
                  <Text tone="muted">{visit.reason}</Text>
                </View>
              ) : null}
              {visit.diagnosis ? (
                <View style={styles.block}>
                  <Text variant="h3">{words.diagnosis.split(' ·')[0]}</Text>
                  <Text tone="muted">{visit.diagnosis}</Text>
                </View>
              ) : null}
              {visit.items.length > 0 ? (
                <View style={styles.block}>
                  <Text variant="h3">{words.prescriptions}</Text>
                  {visit.items.map((item) => (
                    <View key={item.id} style={styles.prescription}>
                      <Text tone="muted">{item.instructions ? `${item.name} — ${item.instructions}` : item.name}</Text>
                      {item.medication_id ? (
                        <Text variant="label" tone="faint">
                          {words.inMedicines}
                        </Text>
                      ) : (
                        <LinkButton title={words.toMedicines} align="left" onPress={() => void toMedicines(item.id)} />
                      )}
                    </View>
                  ))}
                </View>
              ) : null}
            </Card>
          ) : null}

          {visit.notes ? (
            <View style={styles.block}>
              <Text variant="label" tone="muted">
                {t.medicalRecord.notesLabel}
              </Text>
              <Text>{visit.notes}</Text>
            </View>
          ) : null}

          {visit.check_id ? (
            <SettingRow
              icon="history"
              title={words.linkedCheck}
              onPress={() => router.push(`/pets/${id}/check/${visit.check_id}`)}
            />
          ) : null}

          <LinkButton
            title={planned ? t.medicalRecord.cancelPlan : t.medicalRecord.deleteEvent}
            align="left"
            onPress={() => setAsking(true)}
          />
        </>
      ) : null}

      <ConfirmDialog
        visible={asking}
        title={planned ? t.medicalRecord.cancelPlanTitle : t.medicalRecord.deleteEventTitle}
        message={planned ? t.medicalRecord.cancelPlanBody : words.deleteBody}
        confirmTitle={planned ? t.medicalRecord.cancelPlanConfirm : t.pets.removeConfirm}
        cancelTitle={planned ? t.medicalRecord.keepPlan : undefined}
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setAsking(false)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  gap: { marginBottom: space.block },
  card: { padding: 20, gap: 6 },
  block: { gap: 4, marginBottom: space.row },
  prescription: { gap: 0 },
})
