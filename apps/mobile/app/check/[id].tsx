import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { Link, useLocalSearchParams } from 'expo-router'
import { URGENCY_LEVELS, type SymptomCheckRecord } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { Message, Screen } from '@/ui/Screen'

/**
 * Urgency is the first thing a worried owner reads, so it is said in words
 * rather than only shown as a colour — a colour alone is no answer to someone
 * who cannot tell these two apart.
 */
const urgencyLabels: Record<
  (typeof URGENCY_LEVELS)[number],
  { label: string; action: string; colour: string }
> = {
  emergency: {
    label: 'ЭКСТРЕННО',
    action: 'Немедленно в ветеринарную клинику',
    colour: '#b3261e',
  },
  urgent: { label: 'СРОЧНО', action: 'К ветеринару в течение 24 часов', colour: '#b3261e' },
  monitor: {
    label: 'НАБЛЮДАЕМ',
    action: 'Наблюдайте 48 часов, при ухудшении — к врачу',
    colour: '#8a6d00',
  },
  home_care: { label: 'ДОМАШНИЙ УХОД', action: 'Можно лечить дома', colour: '#1a1a1a' },
  healthy: { label: 'ВСЁ В ПОРЯДКЕ', action: 'Ничего делать не нужно', colour: '#1a1a1a' },
}

function Section({ title, items }: { title: string; items: readonly string[] }) {
  if (items.length === 0) return null

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.map((item, index) => (
        <Text key={`${index}-${item.slice(0, 12)}`} style={styles.item}>
          • {item}
        </Text>
      ))}
    </View>
  )
}

export default function CheckResult() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [check, setCheck] = useState<SymptomCheckRecord | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setCheck(await withFreshSession((api) => api.getCheck(id)))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить проверку')
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  if (!check) {
    return (
      <Screen title="Проверка">
        {error ? <Message text={error} /> : <ActivityIndicator />}
        <Link href="/pets">К питомцам</Link>
      </Screen>
    )
  }

  const urgency = urgencyLabels[check.urgency]

  return (
    <Screen title={check.pet_name ?? 'Проверка'} scroll>
      <Text style={[styles.urgency, { color: urgency.colour }]}>{urgency.label}</Text>
      <Text style={styles.action}>{urgency.action}</Text>
      <Text style={styles.reason}>{check.urgency_reason}</Text>

      {check.species_specific_warning ? (
        <Message text={check.species_specific_warning} />
      ) : null}

      <Section title="Возможные причины" items={check.possible_causes} />
      <Section title="Что можно сделать дома" items={check.home_care_steps} />
      <Section title="О чём спросить врача" items={check.vet_questions} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Что вы описали</Text>
        <Text style={styles.item}>{check.symptoms_input}</Text>
      </View>

      <Message
        text="Это не диагноз. Решение о лечении принимает только ветеринарный врач."
        tone="info"
      />
      <Link href="/pets">К питомцам</Link>
    </Screen>
  )
}

const styles = StyleSheet.create({
  urgency: { fontSize: 20, fontWeight: '600' },
  action: { fontSize: 16 },
  reason: { fontSize: 15, color: '#333' },
  section: { gap: 6, marginTop: 8 },
  sectionTitle: { fontSize: 13, color: '#444' },
  item: { fontSize: 15, lineHeight: 21 },
})
