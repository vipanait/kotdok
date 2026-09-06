import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Button, FlatList, StyleSheet, Text, View } from 'react-native'
import { Redirect } from 'expo-router'
import type { Pet } from '@lapka/contracts'
import { ApiError } from '@lapka/shared'
import { withFreshSession } from '@/lib/api'
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

  useEffect(() => {
    if (session) void load()
  }, [session, load])

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
            error ? null : <Message text="Пока никого нет. Добавьте питомца на сайте." tone="info" />
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.species === 'dog' ? 'Собака' : 'Кошка'}</Text>
            </View>
          )}
        />
      )}
      <Button title="Обновить" onPress={() => void load()} />
      <Button title="Выйти" onPress={() => void signOut()} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  name: { fontSize: 18 },
  meta: { color: '#666' },
})
