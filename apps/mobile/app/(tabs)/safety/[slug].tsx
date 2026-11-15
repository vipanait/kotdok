import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { PetSpeciesSchema, type PetSpecies } from '@lapka/contracts'
import { ApiError } from '@lapka/shared'
import { withFreshSession } from '@/lib/api'
import { safetyFailure } from '@/features/safety/states'
import { useCached } from '@/lib/query-cache'
import { queryKeys } from '@/lib/query-keys'
import { useText } from '@/i18n'
import { cardFromItem, entryPlaceholder, entryView, shownSpecies, type SpeciesFlip } from '@/features/safety/card-model'
import { SafetyCard, useSafetyHandOff } from '@/features/safety/SafetyCard'
import { SafetyFootnote } from '@/features/safety/SafetyFootnote'
import { SafetyContextCard, SafetyState } from '@/features/safety/SafetyParts'
import { VerdictBlock } from '@/features/safety/VerdictBadge'
import { Button } from '@/ui/Button'
import { Screen } from '@/ui/Screen'
import { DetailSkeleton } from '@/ui/Skeleton'
import { CONTROL_FONT_LIMIT, Text } from '@/ui/Text'
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
  // The other species, folded open, belongs to this entry for this pet (`shownSpecies`).
  const view = entryView(slug, asked, petId)
  const [flipped, setFlipped] = useState<SpeciesFlip>(null)
  const shown = shownSpecies(flipped, view, asked)

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
      <Screen title={t.safety.title} onBack={toSearch} scroll>
        <SafetyState title={t.safety.gone}>
          <Button title={t.safety.toSearch} onPress={toSearch} />
        </SafetyState>
        <SafetyFootnote />
      </Screen>
    )
  }

  const item = entry.data
  if (!item) {
    const failure = entry.error ? safetyFailure(t, entry.error, 'answer') : null
    // The index's verdict stands in only while loading: next to an error it would read as the answer.
    const placeholder = entryPlaceholder(
      index.data?.items.find((one) => one.slug === slug),
      asked,
      failure !== null,
    )
    return (
      <Screen title={placeholder.title ?? t.safety.title} onBack={toSearch} scroll>
        {placeholder.verdict ? (
          <VerdictBlock
            verdict={placeholder.verdict.verdict}
            label={t.safety.verdict[placeholder.verdict.label]}
            summary={t.safety.loading}
            forWhom={t.safety.verdictFor[asked]}
          />
        ) : null}
        {failure ? (
          <SafetyState title={failure.title} body={failure.body} style={styles.failure}>
            <Button title={t.common.retry} onPress={() => void reload()} />
          </SafetyState>
        ) : (
          <View style={styles.skeleton}>
            <DetailSkeleton facts={2} />
          </View>
        )}
        <SafetyFootnote />
      </Screen>
    )
  }

  const own = shown === asked
  // The notes, «Если Рекс уже съел» and the check are about the pet, not the other species.
  const petName = own && pet ? pet.name : null

  return (
    <Screen title={item.name} onBack={toSearch} scroll>
      <Text variant="label" tone="accent" style={styles.eyebrow} maxFontSizeMultiplier={CONTROL_FONT_LIMIT} numberOfLines={3}>
        {`${t.safety.categories[item.category]} · ${t.safety.reference}`.toLocaleUpperCase()}
      </Text>
      <SafetyContextCard species={shown} petName={petName} avatarUri={pet?.avatar_url} />
      <SafetyCard
        model={cardFromItem(item, shown)}
        species={shown}
        petName={petName}
        handOff={own ? handOff : null}
        onOtherSpecies={() => setFlipped({ view, species: OTHER[shown] })}
      />
      <SafetyFootnote />
    </Screen>
  )
}

const styles = StyleSheet.create({
  eyebrow: { marginBottom: space.row, letterSpacing: 1.5, fontWeight: '800' },
  skeleton: { marginTop: space.block },
  failure: { marginTop: space.block },
})
