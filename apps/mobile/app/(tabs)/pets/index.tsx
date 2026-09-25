import { useCallback, useState } from 'react'
import { FlatList, Image, StyleSheet, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import type { DueItem, Pet } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { localToday } from '@/lib/calendar-day'
import { describeFailure } from '@/lib/errors'
import { useText, type Dictionary } from '@/i18n'
import { dueStatus, itemTitle } from '@/features/medical-record/due'
import { Button } from '@/ui/Button'
import { Avatar, Card } from '@/ui/Card'
import { Banner } from '@/ui/Card'
import { Icon } from '@/ui/Icon'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { colour, radius, shadow, space } from '@/ui/theme'

/** "Кот · Сибирская · 3 года" — only the parts this pet actually has. */
function describe(t: Dictionary, pet: Pet): string {
  const parts: string[] = [t.species[pet.species]]
  if (pet.breed) parts.push(pet.breed)
  if (pet.age_years !== null) parts.push(t.petAge(pet.age_years))
  return parts.join(' · ')
}

/**
 * The pet's earliest due date, only when it is overdue or within two weeks
 * (spec §7.1). `due` is sorted soonest first, so the first match is the one.
 */
function DueLine({ t, due }: { t: Dictionary; due: DueItem | undefined }) {
  if (!due) return null
  const status = dueStatus(t, due.date, localToday())
  if (status.tone === 'later') return null
  const title = itemTitle(t, { id: due.item_id, name: due.name, targets: due.targets, source_item_id: null })
  return (
    <Text
      variant="caption"
      numberOfLines={1}
      style={[styles.petDue, { color: status.tone === 'overdue' ? colour.text : colour.accentText }]}
    >
      {status.tone === 'overdue'
        ? t.medicalRecord.listDue.overdue(title)
        : t.medicalRecord.listDue.soon(title, (status.text ?? status.day).toLowerCase())}
    </Text>
  )
}

/** Three card-shaped blanks while the first page is on its way. */
function Skeletons() {
  return (
    <View>
      {[0, 1, 2].map((row) => (
        <View key={row} style={styles.skeletonRow}>
          <View style={styles.skeletonCircle} />
          <View style={styles.skeletonCopy}>
            <View style={styles.skeletonLine} />
            <View style={[styles.skeletonLine, styles.skeletonShort]} />
          </View>
        </View>
      ))}
    </View>
  )
}

/**
 * The home screen. It goes through the shared API client rather than querying
 * Supabase directly, so the phone and the site see the same rules.
 */
export default function Pets() {
  const t = useText()
  const [pets, setPets] = useState<Pet[] | null>(null)
  const [due, setDue] = useState<DueItem[]>([])
  const [error, setError] = useState<{ text: string; offline: boolean } | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      setPets(await withFreshSession((api) => api.listPets()))
      // A missing due line is not worth an error over the whole list.
      withFreshSession((api) => api.listDue())
        .then(setDue)
        .catch(() => setDue([]))
    } catch (cause) {
      // The list that is already on screen stays there: a lost connection is
      // not a reason to forget the pets we last saw.
      setPets((current) => current ?? [])
      setError(describeFailure(t, cause, t.common.offline))
    } finally {
      setLoading(false)
    }
  }, [t])

  // Reloading on focus rather than on mount: coming back from adding or editing
  // a pet has to show it, and the list is one small request.
  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  /**
   * "Nobody yet" only once the server has said so this time.
   *
   * The tab keeps the last list, so coming back from adding the first pet
   * showed the old empty one — with its illustration and «Добавьте первого» —
   * for the second the reload took. An empty list being reloaded is shown as
   * loading instead; a list with pets in it stays on screen while it refreshes.
   */
  const settling = pets !== null && pets.length === 0 && loading
  const empty = pets !== null && pets.length === 0 && !error && !loading

  return (
    <Screen
      title={t.pets.title}
      action={
        empty || settling
          ? undefined
          : { icon: 'plus', label: t.pets.add, onPress: () => router.push('/pets/new') }
      }
      centered={empty}
      dock={
        empty || settling ? null : (
          <Button title={t.pets.checkSymptoms} onPress={() => router.push('/check')} />
        )
      }
    >
      {error ? (
        <>
          <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} />
          <Button title={t.common.retry} kind="secondary" onPress={() => void load()} />
          <View style={styles.spacer} />
        </>
      ) : null}

      {pets === null || settling ? (
        <Skeletons />
      ) : empty ? (
        <View>
          <Image
            source={require('../../../assets/art/pets-together.png')}
            style={styles.emptyArt}
            resizeMode="contain"
            accessible={false}
          />
          <Text variant="h2" center style={styles.emptyTitle}>
            {t.pets.emptyTitle}
          </Text>
          <Text tone="muted" center style={styles.emptyCopy}>
            {t.pets.emptyBody}
          </Text>
          <Button title={t.pets.add} onPress={() => router.push('/pets/new')} />
        </View>
      ) : (
        <FlatList
          data={pets}
          keyExtractor={(pet) => pet.id}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Card
              onPress={() => router.push(`/pets/${item.id}`)}
              accessibilityLabel={`${item.name}, ${describe(t, item)}`}
              style={styles.petCard}
            >
              <Avatar species={item.species} />
              <View style={styles.petCopy}>
                <Text variant="h2">{item.name}</Text>
                <Text variant="caption" tone="faint" style={styles.petMeta}>
                  {describe(t, item)}
                </Text>
                <DueLine t={t} due={due.find((row) => row.pet_id === item.id)} />
              </View>
              <Icon name="chevron" size={20} color={colour.faint} />
            </Card>
          )}
        />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  spacer: { height: space.block },
  petCard: { flexDirection: 'row', alignItems: 'center', gap: space.row, minHeight: 96 },
  petCopy: { flex: 1, minWidth: 0 },
  petMeta: { marginTop: 4 },
  petDue: { marginTop: 4, fontWeight: '600' },
  emptyArt: { width: 228, height: 228, alignSelf: 'center', marginBottom: 8 },
  emptyTitle: { marginBottom: space.row },
  emptyCopy: { marginBottom: 24, alignSelf: 'center', maxWidth: 310 },

  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    marginBottom: space.row,
    backgroundColor: colour.surface,
    borderRadius: radius.card,
    ...shadow.card,
  },
  skeletonCircle: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colour.soft,
  },
  skeletonCopy: { flex: 1 },
  skeletonLine: { height: 16, borderRadius: 8, backgroundColor: colour.soft, marginBottom: 8 },
  skeletonShort: { width: '60%', marginBottom: 0 },
})
