import { useCallback, useState } from 'react'
import { ActivityIndicator, Button, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { URGENCY_LEVELS, type SymptomCheckRecord } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { Message, Screen } from '@/ui/Screen'

/** Short forms of the wording on the result screen, for a list that has to fit. */
const urgencyShort: Record<(typeof URGENCY_LEVELS)[number], { text: string; colour: string }> = {
  emergency: { text: 'Экстренно', colour: '#b3261e' },
  urgent: { text: 'Срочно', colour: '#b3261e' },
  monitor: { text: 'Наблюдаем', colour: '#8a6d00' },
  home_care: { text: 'Домашний уход', colour: '#1a1a1a' },
  healthy: { text: 'Всё в порядке', colour: '#1a1a1a' },
}

/** Dates are shown as the phone would write them, not as the API sends them. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function History() {
  const [items, setItems] = useState<SymptomCheckRecord[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const loadFirst = useCallback(async () => {
    setError(null)
    try {
      const page = await withFreshSession((api) => api.listChecks())
      setItems(page.items)
      setCursor(page.next_cursor)
    } catch {
      setItems([])
      setError('Не удалось загрузить историю')
    }
  }, [])

  // Reloading on focus: a check made a moment ago has to be here on return.
  useFocusEffect(
    useCallback(() => {
      void loadFirst()
    }, [loadFirst]),
  )

  async function loadMore() {
    if (!cursor || loadingMore) return

    setLoadingMore(true)
    try {
      const page = await withFreshSession((api) => api.listChecks({ cursor }))
      // Appending rather than replacing: the cursor walks (created_at, id), so
      // pages never overlap and never repeat a row.
      setItems((current) => [...(current ?? []), ...page.items])
      setCursor(page.next_cursor)
    } catch {
      setError('Не удалось загрузить ещё')
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <Screen title="История">
      {error ? <Message text={error} /> : null}
      {items === null ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(check) => check.id}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            error ? null : <Message text="Проверок пока не было." tone="info" />
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator /> : null}
          renderItem={({ item }) => {
            const urgency = urgencyShort[item.urgency]
            return (
              <Pressable
                style={styles.row}
                accessibilityRole="button"
                accessibilityLabel={`${item.pet_name ?? 'Без питомца'}, ${urgency.text}`}
                onPress={() => router.push(`/check/${item.id}`)}
              >
                <View style={styles.head}>
                  <Text style={[styles.urgency, { color: urgency.colour }]}>{urgency.text}</Text>
                  <Text style={styles.date}>{formatDate(item.created_at)}</Text>
                </View>
                <Text style={styles.pet}>{item.pet_name ?? 'Без питомца'}</Text>
                <Text style={styles.symptoms} numberOfLines={2}>
                  {item.symptoms_input}
                </Text>
              </Pressable>
            )
          }}
        />
      )}
      <Button title="Проверить симптомы" onPress={() => router.push('/check/new')} />
      <Button title="К питомцам" onPress={() => router.push('/pets')} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { paddingVertical: 12, gap: 4, borderBottomWidth: 1, borderBottomColor: '#eee' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  urgency: { fontSize: 15, fontWeight: '600' },
  date: { color: '#666', fontSize: 13 },
  pet: { fontSize: 16 },
  symptoms: { color: '#555' },
})
