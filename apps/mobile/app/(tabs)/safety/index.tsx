import { useState } from 'react'
import { router } from 'expo-router'
import type { Pet, SafetyIndexItem } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { useCached } from '@/lib/query-cache'
import { queryKeys } from '@/lib/query-keys'
import { useText } from '@/i18n'
import { useAuth } from '@/providers/AuthProvider'
import { SafetySearch } from '@/features/safety/SafetySearch'
import { SafetySubjectPicker } from '@/features/safety/SafetySubjectPicker'
import { defaultSubject, subjectPetId, type SafetySubject } from '@/features/safety/subject'
import { lastPetFor, rememberPet, useAiRemaining, useRecentQueries } from '@/features/safety/use-safety-memory'
import { Button } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Screen } from '@/ui/Screen'
import { ListSkeleton } from '@/ui/Skeleton'

/**
 * A choice still valid for the pets on hand: a pet deleted since, or a
 * species picked by hand before the first pet was added, gives way to the
 * default.
 */
function stillValid(choice: SafetySubject | null, pets: readonly Pet[]): SafetySubject | null {
  if (!choice) return null
  if (choice.kind === 'species') return pets.length === 0 ? choice : null
  return pets.some((pet) => pet.id === choice.petId) ? choice : null
}

/**
 * «Можно ли это питомцу?» — the tab's first screen (design spec, «Приложение»).
 *
 * The index is read through the cache and kept across restarts, so the
 * suggestions under the field come from the phone, not the network.
 */
export default function SafetyHome() {
  const t = useText()
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const { recent, remember } = useRecentQueries(userId)
  const left = useAiRemaining(userId)
  const [query, setQuery] = useState('')
  const [choice, setChoice] = useState<SafetySubject | null>(null)

  const petList = useCached(queryKeys.pets(), () => withFreshSession((api) => api.listPets()))
  const index = useCached(queryKeys.safetyIndex(), () => withFreshSession((api) => api.getSafetyIndex()))

  // Without the pets (not loaded yet, or the network failed with nothing
  // cached) the switch is shown: a cat or a dog still gets an answer.
  const pets: Pet[] = petList.data ?? []
  const subject = stillValid(choice, pets) ?? defaultSubject(pets, lastPetFor(userId))
  const petId = subjectPetId(subject)
  const items = index.data?.items ?? null
  const failure = index.error && !index.data ? describeFailure(t, index.error, t.safety.loadFailed) : null
  const aiLine = left === null ? t.safety.aiLimit : t.safety.aiRemaining(left)

  function choose(next: SafetySubject) {
    setChoice(next)
    if (next.kind === 'pet') rememberPet(userId, next.petId)
  }

  function open(item: SafetyIndexItem) {
    // The entry's name rather than the letters typed to reach it: «шок» is not worth a chip.
    remember(item.name)
    router.push({
      pathname: '/safety/[slug]',
      params: { slug: item.slug, species: subject.species, ...(petId ? { petId } : {}) },
    })
  }

  function ask(text: string) {
    remember(text)
    router.push({ pathname: '/safety/ask', params: { q: text, species: subject.species, ...(petId ? { petId } : {}) } })
  }

  return (
    <Screen title={t.safety.title} scroll>
      {petList.data === null && !petList.error ? (
        <ListSkeleton rows={1} />
      ) : (
        <SafetySubjectPicker pets={pets} subject={subject} onChange={choose} />
      )}
      {failure ? (
        <>
          <Banner text={failure.text} tone="error" icon={failure.offline ? 'wifi' : 'alert'} />
          <Button title={t.common.retry} kind="secondary" onPress={() => void index.reload()} />
        </>
      ) : (
        <SafetySearch
          items={items}
          species={subject.species}
          recent={recent}
          query={query}
          onQuery={setQuery}
          onOpen={open}
          onAsk={ask}
          aiLine={aiLine}
        />
      )}
    </Screen>
  )
}
