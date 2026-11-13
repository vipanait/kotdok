import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { PetSpeciesSchema, type PetSpecies } from '@lapka/contracts'
import { ApiError, verdictLabelKey } from '@lapka/shared'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { useCached } from '@/lib/query-cache'
import { queryKeys } from '@/lib/query-keys'
import { useText } from '@/i18n'
import { cardFromItem } from '@/features/safety/card-model'
import { SafetyCard, useSafetyHandOff } from '@/features/safety/SafetyCard'
import { VerdictBlock } from '@/features/safety/VerdictBadge'
import { Button } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Screen } from '@/ui/Screen'
import { DetailSkeleton } from '@/ui/Skeleton'
import { Text } from '@/ui/Text'
import { space } from '@/ui/theme'

const OTHER: Record<PetSpecies, PetSpecies> = { cat: 'dog', dog: 'cat' }

/**
 * One reference entry, always as the server answers it now: the index on
 * the phone may be a day old, and a verdict is the one thing that must not
 * be. While the answer is on its way the index's name and verdict stand in,
 * marked as loading.
 */
export default function SafetyEntry() {
  const t = useText()
  const params = useLocalSearchParams<{ slug: string; species?: string; petId?: string }>()
  const slug = params.slug
  const petId = params.petId || null
  const asked: PetSpecies = PetSpeciesSchema.safeParse(params.species).data ?? 'cat'
  const [shown, setShown] = useState<PetSpecies>(asked)

  const entry = useCached(queryKeys.safetyItem(slug, petId), () =>
    withFreshSession((api) => api.getSafetyItem(slug, petId ?? undefined)),
  )
  // Every opening asks the server, even inside the cache's half minute: a
  // request already running is joined, not repeated.
  const { reload } = entry
  useEffect(() => {
    void reload()
  }, [reload])

  const index = useCached(queryKeys.safetyIndex(), () => withFreshSession((api) => api.getSafetyIndex()))
  const pets = useCached(queryKeys.pets(), () => withFreshSession((api) => api.listPets()))
  const pet = petId ? pets.data?.find((one) => one.id === petId) ?? null : null
  const handOff = useSafetyHandOff(entry.data?.name ?? '', petId)

  const toSearch = () => (router.canGoBack() ? router.back() : router.replace('/safety'))

  if (entry.error instanceof ApiError && entry.error.code === 'not_found') {
    return (
      <Screen onBack={toSearch} scroll>
        <Text variant="h2" style={styles.goneTitle}>
          {t.safety.gone}
        </Text>
        <Button title={t.safety.toSearch} kind="secondary" onPress={toSearch} />
      </Screen>
    )
  }

  const item = entry.data
  if (!item) {
    const known = index.data?.items.find((one) => one.slug === slug)
    const failure = entry.error ? describeFailure(t, entry.error, t.safety.loadFailed) : null
    return (
      <Screen title={known?.name} onBack={toSearch} scroll>
        {known ? (
          <VerdictBlock
            verdict={known.verdict[asked]}
            label={t.safety.verdict[verdictLabelKey(known.category, known.verdict[asked])]}
            summary={failure ? '' : t.safety.loading}
          />
        ) : null}
        {failure ? (
          <View>
            <Banner text={failure.text} tone="error" icon={failure.offline ? 'wifi' : 'alert'} />
            <Button title={t.common.retry} kind="secondary" onPress={() => void reload()} />
          </View>
        ) : (
          <DetailSkeleton facts={2} />
        )}
      </Screen>
    )
  }

  const own = shown === asked
  const forWhom = own && pet ? t.safety.forPet(pet.name, pet.species) : t.safety.forSpecies[shown]

  return (
    <Screen title={item.name} onBack={toSearch} scroll>
      <SafetyCard
        model={cardFromItem(item, shown)}
        forWhom={forWhom}
        // The notes and «Если Рекс уже съел» are about the pet, not the other species.
        petName={own && pet ? pet.name : null}
        handOff={own ? handOff : null}
        onOtherSpecies={() => setShown(OTHER[shown])}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  goneTitle: { marginTop: space.block, marginBottom: space.block },
})
