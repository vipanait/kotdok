import { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, View } from 'react-native'
import { Redirect, router, useFocusEffect } from 'expo-router'
import type { Pet } from '@lapka/contracts'
import { ApiError } from '@lapka/shared'
import { withFreshSession } from '@/lib/api'
import { speciesLabels } from '@/features/pets/labels'
import { useAuth } from '@/providers/AuthProvider'
import { Button, LinkButton } from '@/ui/Button'
import { Avatar, Banner, Card } from '@/ui/Card'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { colour, space } from '@/ui/theme'

/** "Кот · Сибирская · 3 года" — only the parts this pet actually has. */
function describe(pet: Pet): string {
  const parts: string[] = [speciesLabels[pet.species]]
  if (pet.breed) parts.push(pet.breed)
  if (pet.age_years !== null) parts.push(years(pet.age_years))
  return parts.join(' · ')
}

function years(count: number): string {
  const tens = count % 100
  if (tens >= 11 && tens <= 14) return `${count} лет`

  switch (count % 10) {
    case 1:
      return `${count} год`
    case 2:
    case 3:
    case 4:
      return `${count} года`
    default:
      return `${count} лет`
  }
}

/**
 * The home screen. It goes through the shared API client rather than querying
 * Supabase directly, so the phone and the site see the same rules.
 */
export default function Pets() {
  const { session, loading: sessionLoading } = useAuth()
  const [pets, setPets] = useState<Pet[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setPets(await withFreshSession((api) => api.listPets()))
    } catch (cause) {
      setPets([])
      setError(
        cause instanceof ApiError
          ? `Не удалось загрузить питомцев (${cause.code})`
          : 'Нет связи с сервером',
      )
    }
  }, [])

  // Reloading on focus rather than on mount: coming back from adding or editing
  // a pet has to show it, and the list is one small request.
  useFocusEffect(
    useCallback(() => {
      if (session) void load()
    }, [session, load]),
  )

  if (sessionLoading) {
    return (
      <Screen title="Питомцы">
        <ActivityIndicator color={colour.accent} />
      </Screen>
    )
  }

  if (!session) return <Redirect href="/sign-in" />

  const empty = pets !== null && pets.length === 0 && !error

  return (
    <Screen
      dock={
        empty ? null : (
          <>
            <Button title="Проверить симптомы" onPress={() => router.push('/check/new')} />
            <LinkButton title="Профиль и история" onPress={() => router.push('/profile')} />
          </>
        )
      }
    >
      <View style={styles.head}>
        <Text variant="h1">Питомцы</Text>
        {empty ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Добавить питомца"
            onPress={() => router.push('/pets/new')}
            style={styles.add}
          >
            <Text variant="h2" tone="accent">
              +
            </Text>
          </Pressable>
        )}
      </View>

      {error ? <Banner text={error} tone="error" /> : null}

      {pets === null ? (
        <ActivityIndicator color={colour.accent} />
      ) : empty ? (
        <View style={styles.empty}>
          <Image
            source={require('../../assets/art/pets-together.png')}
            style={styles.emptyArt}
            resizeMode="contain"
            accessible={false}
          />
          <Text variant="h2" center>
            Здесь будут ваши питомцы
          </Text>
          <Text tone="muted" center style={styles.emptyCopy}>
            Пока никого нет. Добавьте первого.
          </Text>
          <Button title="Добавить питомца" onPress={() => router.push('/pets/new')} />
        </View>
      ) : (
        <FlatList
          data={pets}
          keyExtractor={(pet) => pet.id}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Card
              onPress={() => router.push(`/pets/${item.id}`)}
              accessibilityLabel={`${item.name}, ${describe(item)}`}
              style={styles.petCard}
            >
              <Avatar species={item.species} />
              <View style={styles.petCopy}>
                <Text variant="h3">{item.name}</Text>
                <Text variant="caption" tone="faint" style={styles.petMeta}>
                  {describe(item)}
                </Text>
              </View>
              <Text variant="h3" tone="faint">
                ›
              </Text>
            </Card>
          )}
        />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.block,
  },
  add: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: colour.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petCard: { flexDirection: 'row', alignItems: 'center', gap: space.row, minHeight: 96 },
  petCopy: { flex: 1, minWidth: 0 },
  petMeta: { marginTop: 4 },
  empty: { flex: 1, justifyContent: 'center' },
  emptyArt: { width: 228, height: 228, alignSelf: 'center' },
  emptyCopy: { marginTop: space.row, marginBottom: 24 },
})
