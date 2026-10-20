import { useCallback, useEffect, useRef, useState } from 'react'
import { BackHandler, StyleSheet, View } from 'react-native'
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import type { Pet } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { useText } from '@/i18n'
import { ChoiceRow } from '@/features/onboarding/ChoiceRow'
import { Button, LinkButton } from '@/ui/Button'
import { Avatar, Banner } from '@/ui/Card'
import { Icon } from '@/ui/Icon'
import { Screen } from '@/ui/Screen'
import { FormSkeleton } from '@/ui/Skeleton'
import { Text } from '@/ui/Text'
import { colour, space } from '@/ui/theme'

/**
 * After the card is made on onboarding's health path (design 20 October
 * 2026): the first record, if the owner remembers one. Each choice opens the
 * usual form for this pet over its card, so saving shows the record there and
 * back lands on the card too. Nothing is made up: no sample records, no dates.
 * The first steps' questions are not asked on this path — the forms ask.
 */
export default function FirstRecord() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useText()
  const words = t.onboarding
  const [pet, setPet] = useState<Pet | null>(null)
  const [error, setError] = useState<{ text: string; offline: boolean } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    setError(null)
    withFreshSession((api) => api.getPet(id))
      .then(setPet)
      .catch((cause) => setError(describeFailure(t, cause, t.errors.loadPetsFailed)))
  }, [id, t, attempt])

  // Once: a second tap on the way out would put a second card or form on top.
  const leaving = useRef(false)
  const toCard = useCallback(() => {
    if (leaving.current) return
    leaving.current = true
    router.replace(`/pets/${id}`)
  }, [id])
  // The card goes under the form, so the form's save and back both end on it.
  const open = (form: string) => {
    if (leaving.current) return
    toCard()
    router.push(form as never)
  }

  // Back of any kind — the header, Android's — goes to the new card, not past it.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        toCard()
        return true
      })
      return () => subscription.remove()
    }, [toCard]),
  )
  // The iOS swipe would pop to the list under it: off here, the arrow does the same.
  const noSwipe = <Stack.Screen options={{ gestureEnabled: false }} />

  if (!pet) {
    return (
      <Screen title={words.createdTitle} onBack={toCard}>
        {noSwipe}
        {error ? (
          <>
            <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} />
            <Button title={t.common.retry} onPress={() => setAttempt((count) => count + 1)} />
            <LinkButton title={words.later} onPress={toCard} />
          </>
        ) : (
          <FormSkeleton fields={3} />
        )}
      </Screen>
    )
  }

  return (
    <Screen title={words.createdTitle} onBack={toCard} scroll dock={<LinkButton title={words.later} onPress={toCard} />}>
      {noSwipe}
      <View style={styles.head} accessible accessibilityLabel={`${pet.name}. ${words.created}`}>
        <Avatar species={pet.species} uri={pet.avatar_url} size={72} />
        <View style={styles.headCopy}>
          <Text variant="h2" numberOfLines={2}>
            {pet.name}
          </Text>
          <View style={styles.created}>
            <Icon name="check" size={18} color={colour.accentText} />
            <Text variant="label" tone="accent">
              {words.created}
            </Text>
          </View>
        </View>
      </View>

      <Text variant="h1" accessibilityRole="header" style={styles.title}>
        {words.firstRecord}
      </Text>
      <Text tone="muted" style={styles.body}>
        {words.firstRecordBody}
      </Text>

      <ChoiceRow
        icon="vaccine"
        title={words.vaccination}
        body={words.vaccinationBody}
        onPress={() => open(`/pets/${id}/event-form?mode=new&status=done`)}
      />
      <ChoiceRow
        icon="parasite"
        title={words.parasite}
        body={words.parasiteBody}
        onPress={() => open(`/pets/${id}/event-form?mode=new&status=done&kind=parasite`)}
      />
      <ChoiceRow icon="visit" title={words.visit} body={words.visitBody} onPress={() => open(`/pets/${id}/visit-form`)} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: space.section },
  headCopy: { flex: 1, minWidth: 0, gap: 4 },
  created: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { marginBottom: space.row },
  body: { marginBottom: space.block },
})
