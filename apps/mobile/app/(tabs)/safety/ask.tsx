import { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { PetSpeciesSchema, SAFETY_QUERY_MAX, type PetSpecies, type SafetyAskResult } from '@lapka/contracts'
import { ApiError } from '@lapka/shared'
import { withFreshSession } from '@/lib/api'
import { useCached } from '@/lib/query-cache'
import { queryKeys } from '@/lib/query-keys'
import { useText } from '@/i18n'
import { useAuth } from '@/providers/AuthProvider'
import { cardFromAi } from '@/features/safety/card-model'
import { SafetyCard, useSafetyHandOff } from '@/features/safety/SafetyCard'
import { noteAiRemaining, useAiRemaining, useRecentQueries } from '@/features/safety/use-safety-memory'
import { Button } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Field } from '@/ui/Field'
import { Screen } from '@/ui/Screen'
import { ResultSkeleton } from '@/ui/Skeleton'
import { Text } from '@/ui/Text'
import { space } from '@/ui/theme'

type AiAnswer = Extract<SafetyAskResult, { source: 'ai' }>
type Phase =
  | { kind: 'asking' }
  | { kind: 'ai'; answer: AiAnswer }
  | { kind: 'unrecognized' }
  | { kind: 'limited' }
  | { kind: 'failed' }

/**
 * The AI answer for what the reference does not hold, asked once per query.
 * The server looks in the reference again first: a hit there opens the
 * entry instead, in place of this screen.
 */
export default function SafetyAsk() {
  const t = useText()
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const params = useLocalSearchParams<{ q: string; species?: string; petId?: string }>()
  const query = (params.q ?? '').slice(0, SAFETY_QUERY_MAX)
  const petId = params.petId || null
  const species: PetSpecies = PetSpeciesSchema.safeParse(params.species).data ?? 'cat'
  const [phase, setPhase] = useState<Phase>({ kind: 'asking' })
  const [next, setNext] = useState('')
  const { remember } = useRecentQueries(userId)
  const left = useAiRemaining(userId)

  const pets = useCached(queryKeys.pets(), () => withFreshSession((api) => api.listPets()))
  const pet = petId ? pets.data?.find((one) => one.id === petId) ?? null : null
  const handOff = useSafetyHandOff(phase.kind === 'ai' ? phase.answer.title : '', petId)

  const ask = useCallback(async () => {
    setPhase({ kind: 'asking' })
    try {
      const result = await withFreshSession((api) =>
        api.askSafety(petId ? { query, pet_id: petId } : { query, species }),
      )
      if (result.source === 'catalog') {
        router.replace({ pathname: '/safety/[slug]', params: { slug: result.slug, species, ...(petId ? { petId } : {}) } })
        return
      }
      noteAiRemaining(userId, result.remaining_today)
      setPhase(result.source === 'ai' ? { kind: 'ai', answer: result } : { kind: 'unrecognized' })
    } catch (cause) {
      const limited = cause instanceof ApiError && cause.code === 'rate_limited'
      // Refused for the limit: none left today, whatever the last answer said.
      if (limited) noteAiRemaining(userId, 0)
      setPhase({ kind: limited ? 'limited' : 'failed' })
    }
  }, [petId, query, species, userId])

  // Once per query: a question spends one of the day's ten answers, so a
  // re-render must never send it twice.
  const askedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!query || askedFor.current === query) return
    askedFor.current = query
    void ask()
  }, [ask, query])

  function askAnother() {
    const text = next.trim()
    if (!text) return
    remember(text)
    setNext('')
    // The same words again change no parameter, so they are asked here.
    if (text === query) void ask()
    else router.setParams({ q: text })
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace('/safety'))
  const aiLine = left === null ? t.safety.aiLimit : t.safety.aiRemaining(left)

  if (phase.kind === 'ai') {
    const answer = phase.answer
    return (
      <Screen title={answer.title} onBack={back} scroll>
        <SafetyCard
          model={cardFromAi(answer)}
          forWhom={pet ? t.safety.forPet(pet.name, pet.species) : t.safety.forSpecies[answer.species]}
          petName={pet?.name ?? null}
          handOff={handOff}
          aiLine={aiLine}
        />
      </Screen>
    )
  }

  return (
    <Screen title={query} onBack={back} scroll>
      {phase.kind === 'asking' ? (
        <>
          <Text tone="muted" style={styles.lead}>
            {t.safety.asking}
          </Text>
          <ResultSkeleton />
        </>
      ) : null}

      {phase.kind === 'unrecognized' ? (
        <View>
          <Banner text={t.safety.unrecognized} tone="note" />
          <Field
            label={t.safety.newQuestion}
            value={next}
            onChangeText={(text) => setNext(text.slice(0, SAFETY_QUERY_MAX))}
            placeholder={t.safety.searchPlaceholder}
            autoCorrect={false}
          />
          <Button title={t.safety.askAi} disabled={!next.trim()} onPress={askAnother} />
          <Text variant="caption" tone="faint" center style={styles.line}>
            {aiLine}
          </Text>
        </View>
      ) : null}

      {phase.kind === 'limited' ? <Banner text={t.safety.rateLimited} tone="note" /> : null}

      {phase.kind === 'failed' ? (
        <>
          <Banner text={t.safety.askFailed} tone="error" />
          <Button title={t.common.retry} kind="secondary" onPress={() => void ask()} />
        </>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  lead: { marginBottom: space.block },
  line: { marginTop: 8 },
})
