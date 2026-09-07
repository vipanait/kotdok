import { useCallback, useState } from 'react'
import { ActivityIndicator, Button, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { Redirect, router, useFocusEffect } from 'expo-router'
import type { Pet } from '@lapka/contracts'
import { ApiError } from '@lapka/shared'
import { withFreshSession } from '@/lib/api'
import { speciesLabels } from '@/features/pets/labels'
import { useAuth } from '@/providers/AuthProvider'
import { Message, Screen } from '@/ui/Screen'

/**
 * The first product screen. It goes through the shared API client rather than
 * querying Supabase directly, so the phone and the site see the same rules.
 */
export default function Pets() {
  const { session, loading: sessionLoading, signOut } = useAuth()
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
        <ActivityIndicator />
      </Screen>
    )
  }

  if (!session) return <Redirect href="/sign-in" />

  return (
    <Screen title="Питомцы">
      {error ? <Message text={error} /> : null}
      {pets === null ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={pets}
          keyExtractor={(pet) => pet.id}
          ListEmptyComponent={
            error ? null : <Message text="Пока никого нет. Добавьте первого." tone="info" />
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${speciesLabels[item.species]}`}
              onPress={() => router.push(`/pets/${item.id}`)}
            >
              <Text style={styles.name}>{item.name}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.meta}>{speciesLabels[item.species]}</Text>
                {item.breed ? <Text style={styles.meta}>{item.breed}</Text> : null}
              </View>
            </Pressable>
          )}
        />
      )}
      <Button title="Добавить питомца" onPress={() => router.push('/pets/new')} />
      <Button title="Обновить" onPress={() => void load()} />
      <Button title="Выйти" onPress={() => void signOut()} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  name: { fontSize: 18 },
  metaRow: { flexDirection: 'row', gap: 8 },
  meta: { color: '#666' },
})
