import { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import type { SymptomCheckRecord } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { speciesLabels } from '@/features/pets/labels'
import { urgencyText } from '@/features/checks/urgency'
import { Button } from '@/ui/Button'
import { Banner, Card, IconAvatar, UrgencyBadge } from '@/ui/Card'
import { Text } from '@/ui/Text'
import { colour, space } from '@/ui/theme'

/**
 * Dates as a person writes them, not as the API sends them.
 *
 * The locale is the interface's, not the device's: every other word on this
 * card is Russian, and a phone set to English would otherwise put "7 September"
 * under "Мурка · Кот". When the app gains a second language this follows the
 * profile's `locale` instead of being fixed here.
 */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

/** "Мурка · Кот", or as much of it as the record carries. */
function heading(check: SymptomCheckRecord): string {
  const parts = [check.pet_name, check.pet_species ? speciesLabels[check.pet_species] : null]
  const named = parts.filter((part): part is string => Boolean(part))
  return named.length > 0 ? named.join(' · ') : 'Без питомца'
}

/**
 * The list of past results, whole or narrowed to one pet.
 *
 * Both screens share it so a check reads the same wherever it is met — the
 * level in words, what was described, and when.
 */
export function CheckHistory({ petId }: { petId?: string }) {
  const [items, setItems] = useState<SymptomCheckRecord[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const loadFirst = useCallback(async () => {
    setError(null)
    try {
      const page = await withFreshSession((api) => api.listChecks({ pet_id: petId }))
      setItems(page.items)
      setCursor(page.next_cursor)
    } catch {
      setItems([])
      setError('Не удалось загрузить историю')
    }
  }, [petId])

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
      const page = await withFreshSession((api) => api.listChecks({ pet_id: petId, cursor }))
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

  if (items === null) {
    return <ActivityIndicator color={colour.accent} />
  }

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        {error ? (
          <Banner text={error} tone="error" />
        ) : (
          <>
            <View style={styles.emptyArt}>
              <IconAvatar icon="history" size={72} />
            </View>
            <Text variant="h2" center style={styles.emptyTitle}>
              Проверок пока не было
            </Text>
            <Text tone="muted" center style={styles.emptyCopy}>
              Здесь появятся результаты, когда вы проверите симптомы
            </Text>
            <Button title="Проверить симптомы" onPress={() => router.push('/check')} />
          </>
        )}
      </View>
    )
  }

  return (
    <>
      {error ? <Banner text={error} tone="error" /> : null}
      <FlatList
        data={items}
        keyExtractor={(check) => check.id}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.4}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colour.accent} /> : null}
        renderItem={({ item }) => {
          const level = urgencyText[item.urgency]
          return (
            <Card
              outlined
              onPress={() => router.push(`/check/${item.id}`)}
              accessibilityLabel={`${heading(item)}, ${level.label}, ${formatDate(item.created_at)}`}
            >
              <UrgencyBadge level={item.urgency} label={level.label} />
              <Text variant="h3" style={styles.cardTitle}>
                {heading(item)}
              </Text>
              <Text tone="muted" numberOfLines={1}>
                {item.symptoms_input}
              </Text>
              <Text variant="caption" tone="faint" style={styles.cardDate}>
                {formatDate(item.created_at)}
              </Text>
            </Card>
          )
        }}
      />
    </>
  )
}

const styles = StyleSheet.create({
  cardTitle: { marginTop: space.row, marginBottom: 4 },
  cardDate: { marginTop: space.row, textAlign: 'right' },
  empty: { flex: 1, justifyContent: 'center' },
  emptyArt: { alignItems: 'center', marginBottom: 24 },
  emptyTitle: { marginBottom: space.row },
  emptyCopy: { marginBottom: 24, alignSelf: 'center', maxWidth: 310 },
})
