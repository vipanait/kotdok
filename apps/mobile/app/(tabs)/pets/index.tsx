import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, Image, StyleSheet, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import type { DueItem, Pet } from '@lapka/contracts'
import { nearestDueByPet } from '@lapka/shared'
import { ageText } from '@/features/pets/pet-age'
import { withFreshSession } from '@/lib/api'
import { useCached } from '@/lib/query-cache'
import { localToday } from '@/lib/calendar-day'
import { describeFailure } from '@/lib/errors'
import { useText, type Dictionary } from '@/i18n'
import { listDueLine } from '@/features/medical-record/due'
import { Welcome } from '@/features/onboarding/Welcome'
import { onboardingStore, resumeOnce, settle } from '@/features/onboarding/store'
import type { OnboardingGoal, OnboardingState } from '@/features/onboarding/onboarding-store'
import { useAuth } from '@/providers/AuthProvider'
import { Button } from '@/ui/Button'
import { Avatar, Card } from '@/ui/Card'
import { Banner } from '@/ui/Card'
import { Icon } from '@/ui/Icon'
import { Screen } from '@/ui/Screen'
import { ListSkeleton } from '@/ui/Skeleton'
import { Text } from '@/ui/Text'
import { colour, space } from '@/ui/theme'

/** "Кот · Сибирская · 3 года" — only the parts this pet actually has. */
function describe(t: Dictionary, pet: Pet): string {
  const parts: string[] = [t.species[pet.species]]
  if (pet.breed) parts.push(pet.breed)
  // Months under a year from a birth date, otherwise years with zero said (`ageText`, FB-2/05).
  const age = ageText(t, pet, localToday())
  if (age !== null) parts.push(age)
  return parts.join(' · ')
}

/**
 * The pet's earliest due date, only when it is overdue or within two weeks
 * (spec §7.1) — which one is `nearestDueByPet`, shared with the site's pet
 * rows, and named as §7.1 names it (`dueLineTitle`), a visit by its kind.
 */
function DueLine({ t, due }: { t: Dictionary; due: DueItem | undefined }) {
  const line = due ? listDueLine(t, due, localToday()) : null
  if (!line) return null
  const colourStyle = { color: line.tone === 'overdue' ? colour.text : colour.accentText }
  // Two texts in a row: only the name gives way on a narrow screen, the status never does (MW-09).
  return (
    <View style={styles.petDueRow} accessible accessibilityLabel={line.text}>
      <Text variant="caption" numberOfLines={1} style={[styles.petDue, styles.petDueTitle, colourStyle]}>
        {line.title}
      </Text>
      <Text variant="caption" numberOfLines={1} style={[styles.petDue, styles.petDueStatus, colourStyle]}>
        {line.status}
      </Text>
    </View>
  )
}

/**
 * The home screen. It goes through the shared API client rather than querying
 * Supabase directly, so the phone and the site see the same rules.
 */
export default function Pets() {
  const t = useText()
  // Through the cache: the pets seen last time at once, refreshed each time the
  // list comes back into view (adding or editing a pet has to show it).
  const list = useCached(['pets'], () => withFreshSession((api) => api.listPets()))
  // A missing due line is not worth an error over the whole list.
  const dueList = useCached(['due'], () => withFreshSession((api) => api.listDue()))
  // The list that is already on screen stays there on a failed refresh: a lost
  // connection is not a reason to forget the pets we last saw.
  const pets: Pet[] | null = list.data ?? (list.error ? [] : null)
  const due: DueItem[] = dueList.data ?? []
  const error = list.error ? describeFailure(t, list.error, t.common.offline) : null
  const loading = list.fetching
  const load = list.reload
  const dueByPet = useMemo(() => nearestDueByPet(due, localToday()), [due])

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

  // Onboarding (design 20 October 2026): the first entry of someone with no
  // pet offers two ways in. Read on every focus, per account.
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null)
  // Whether a path may still be resumed: only one read at a launch's start.
  const resumable = useRef<OnboardingGoal | null>(null)
  useFocusEffect(
    useCallback(() => {
      if (!userId) return
      void onboardingStore.read(userId).then((state) => {
        if (state.goal && !state.skipped && resumeOnce(userId)) resumable.current = state.goal
        else settle(userId)
        // Only the choice is shown from here; a path is begun by a tap.
        setOnboarding({ ...state, goal: null })
      })
    }, [userId]),
  )

  // One screen per tap: a second tap while the first is on its way is the same tap.
  const starting = useRef(false)
  useFocusEffect(
    useCallback(() => {
      starting.current = false
    }, []),
  )

  const start = useCallback((goal: OnboardingGoal) => {
    if (starting.current) return
    starting.current = true
    // A check needs a pet: its form, in the check tab, then straight on to
    // the check with that pet. The health path creates the card first.
    if (goal === 'check') router.navigate('/check/new-pet?goal=check')
    else router.push('/pets/new?goal=health')
  }, [])

  function choose(goal: OnboardingGoal) {
    if (!userId) return
    settle(userId)
    void onboardingStore.choose(userId, goal).catch(() => undefined)
    start(goal)
  }

  function skip() {
    setOnboarding((current) => ({ ...(current ?? onboardingStore.empty), skipped: true, goal: null }))
    if (userId) {
      settle(userId)
      void onboardingStore.skip(userId).catch(() => undefined)
    }
  }

  // An account that has pets — one added on the site, say — has nothing to
  // resume: the stored path is closed, not kept for after a last pet is deleted.
  const hasPets = pets !== null && pets.length > 0
  useEffect(() => {
    if (!hasPets || !userId || !resumable.current) return
    resumable.current = null
    void onboardingStore.finish(userId).catch(() => undefined)
  }, [hasPets, userId])

  // A path begun before the app was closed goes on without asking again — once.
  useEffect(() => {
    if (!empty || !resumable.current) return
    const goal = resumable.current
    resumable.current = null
    start(goal)
  }, [empty, onboarding, start])

  const welcome = empty && onboarding !== null && !onboarding.skipped

  return (
    <Screen
      // The first entry has the logo instead of a title.
      title={welcome ? undefined : t.pets.title}
      action={
        empty || settling
          ? undefined
          : { icon: 'plus', label: t.pets.add, onPress: () => router.push('/pets/new') }
      }
      centered={empty && !welcome}
      scroll={welcome}
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

      {pets === null || settling || (empty && onboarding === null) ? (
        <ListSkeleton rows={3} avatar />
      ) : welcome ? (
        <Welcome onCheck={() => choose('check')} onHealth={() => choose('health')} onSkip={skip} />
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
              <Avatar species={item.species} uri={item.avatar_url} />
              <View style={styles.petCopy}>
                {/* One line: the card is a row in a list, the full name is on the pet's own screen. */}
                <Text variant="h2" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text variant="caption" tone="faint" style={styles.petMeta}>
                  {describe(t, item)}
                </Text>
                <DueLine t={t} due={dueByPet[item.id]} />
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
  petDueRow: { flexDirection: 'row', marginTop: 4, minWidth: 0 },
  petDue: { fontWeight: '600' },
  petDueTitle: { flexShrink: 1 },
  petDueStatus: { flexShrink: 0, marginLeft: 4 },
  emptyArt: { width: 228, height: 228, alignSelf: 'center', marginBottom: 8 },
  emptyTitle: { marginBottom: space.row },
  emptyCopy: { marginBottom: 24, alignSelf: 'center', maxWidth: 310 },
})
