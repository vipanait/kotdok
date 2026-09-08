import { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, Image, StyleSheet, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import type { SymptomCheckRecord } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { dictionary, useLocale, useText } from '@/i18n'
import { urgencyText } from '@/features/checks/urgency'
import { Button } from '@/ui/Button'
import { Banner, Card, UrgencyBadge } from '@/ui/Card'
import { Text } from '@/ui/Text'
import { colour, space } from '@/ui/theme'

/**
 * Dates as a person writes them, not as the API sends them.
 *
 * The interface's language, not the device's: a phone set to English would
 * otherwise put "7 September" under a card written in Russian.
 */
function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'long' })
}

/**
 * The list of past results, whole or narrowed to one pet.
 *
 * Both screens share it so a check reads the same wherever it is met — the
 * level in words, what was described, and when.
 */
export function CheckHistory({ petId }: { petId?: string }) {
  const ui = useText()
  const locale = useLocale()

  /** "Мурка · Кот", or as much of it as the record carries. */
  function heading(check: SymptomCheckRecord): string {
    const parts = [
      check.pet_name,
      check.pet_species ? ui.species[check.pet_species] : null,
    ]
    const named = parts.filter((part): part is string => Boolean(part))
    return named.length > 0 ? named.join(' · ') : ui.check.noPet
  }

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
      setError(ui.common.offline)
    }
  }, [petId, ui])

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
      setError(ui.common.offline)
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
            <Image
              source={require('../../../assets/art/welcome-pets.png')}
              style={styles.emptyArt}
              resizeMode="contain"
              accessible={false}
            />
            <Text variant="h2" center style={styles.emptyTitle}>
              {ui.history.emptyTitle}
            </Text>
            <Text tone="muted" center style={styles.emptyCopy}>
              {ui.history.emptyBody}
            </Text>
            <Button title={ui.pets.checkSymptoms} onPress={() => router.push('/check')} />
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
          // The badge is written in the language the analysis was, so the word
          // and the sentences it summarises never disagree.
          const level = urgencyText(dictionary(item.locale), item.urgency)
          return (
            <Card
              outlined
              onPress={() => router.push(`/check/${item.id}`)}
              accessibilityLabel={`${heading(item)}, ${level.label}, ${formatDate(item.created_at, locale)}`}
            >
              <UrgencyBadge level={item.urgency} label={level.label} />
              <Text variant="h3" style={styles.cardTitle}>
                {heading(item)}
              </Text>
              <Text tone="muted" numberOfLines={1}>
                {item.symptoms_input}
              </Text>
              <Text variant="caption" tone="faint" style={styles.cardDate}>
                {formatDate(item.created_at, locale)}
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
  emptyArt: { width: 228, height: 228, alignSelf: 'center', marginBottom: 8 },
  emptyTitle: { marginBottom: space.row },
  emptyCopy: { marginBottom: 24, alignSelf: 'center', maxWidth: 310 },
})
