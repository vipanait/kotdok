import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import type { SymptomCheckRecord } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { dictionary, useText } from '@/i18n'
import { urgencyText } from '@/features/checks/urgency'
import { checkAnswers, formatCheckedAt, offersVisit, photoObservations, visitReason } from '@/features/checks/check-answers'
import { ResultFeedback } from '@/features/checks/ResultFeedback'
import { Button, LinkButton } from '@/ui/Button'
import { Banner, UrgencyCard } from '@/ui/Card'
import { Screen } from '@/ui/Screen'
import { Accordion, Bullets } from '@/ui/Section'
import { Text } from '@/ui/Text'
import { colour, space } from '@/ui/theme'

/**
 * One finished check, read back.
 *
 * Every tab that lists checks has its own route to this, so opening a result
 * from the history stays in that tab's stack. Pointing them all at the check
 * tab switched tabs first, and the new-check form flashed past on the way.
 */
export function CheckResult({ id }: { id: string }) {
  const ui = useText()
  const [check, setCheck] = useState<SymptomCheckRecord | null>(null)
  const [error, setError] = useState<{ text: string; offline: boolean } | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      setCheck(await withFreshSession((api) => api.getCheck(id)))
    } catch (cause) {
      setError(describeFailure(ui, cause, ui.common.offline))
    }
  }, [id, ui])

  useEffect(() => {
    void load()
  }, [load])

  async function copyQuestions() {
    if (!check) return
    // The questions are the part that has to survive the trip to the clinic,
    // where the phone will be in someone else's hands or in a pocket.
    await Clipboard.setStringAsync(check.vet_questions.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!check) {
    return (
      <Screen title={ui.result.fallbackTitle} onBack={() => router.back()}>
        {error ? (
          <>
            <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} />
            <Button title={ui.common.retry} kind="secondary" onPress={() => void load()} />
            <LinkButton title={ui.common.toPets} onPress={() => router.replace('/pets')} />
          </>
        ) : (
          <ActivityIndicator color={colour.accent} />
        )}
      </Screen>
    )
  }

  /**
   * The result speaks the language it was written in, not the one set now.
   *
   * The reasons, the causes and the steps came back from the analysis in the
   * account's language at the time. Relabelling them with today's choice would
   * put an English heading over Russian sentences and call it a translation.
   */
  const t = dictionary(check.locale)
  const level = urgencyText(t, check.urgency)
  const answers = checkAnswers(t, check.full_response)
  const seenInPhotos = photoObservations(check.full_response)

  return (
    <Screen title={check.pet_name ?? t.result.fallbackTitle} onBack={() => router.back()} scroll>
      <Text variant="caption" tone="faint" style={styles.checkedAt}>
        {formatCheckedAt(check.created_at, check.locale)}
      </Text>

      <UrgencyCard
        level={check.urgency}
        icon={level.icon}
        label={level.label}
        action={level.action}
        reason={check.urgency_reason}
      />

      {check.species_specific_warning ? (
        <Banner text={check.species_specific_warning} tone="note" />
      ) : null}

      {seenInPhotos ? <Bullets title={t.result.photoObservations} items={[seenInPhotos]} /> : null}

      <Bullets title={t.result.causes} items={check.possible_causes} />
      <Bullets title={t.result.homeCare} items={check.home_care_steps} />
      <Bullets title={t.result.vetQuestions} items={check.vet_questions} />

      {check.vet_questions.length > 0 ? (
        <LinkButton
          title={copied ? t.result.copied : t.result.copy}
          align="left"
          onPress={() => void copyQuestions()}
        />
      ) : null}

      <Accordion title={t.result.youDescribed} soft>
        <Text tone="muted">{check.symptoms_input}</Text>
        {answers.map((answer) => (
          <View key={answer.label} style={styles.answer}>
            <Text variant="label" tone="faint">
              {answer.label}
            </Text>
            <Text tone="muted">{answer.value}</Text>
          </View>
        ))}
      </Accordion>

      <Banner text={t.result.disclaimer} />

      {offersVisit(check) ? (
        <View style={styles.visit}>
          <Button
            title={ui.medicalRecord.visits.fromResult}
            kind="secondary"
            onPress={() =>
              router.push(
                `/pets/${check.pet_id}/visit-form?checkId=${check.id}&reason=${encodeURIComponent(visitReason(check.symptoms_input))}`,
              )
            }
          />
        </View>
      ) : null}

      <ResultFeedback checkId={check.id} />

      {/* At the end rather than docked: the answer is the thing to read, and a
          fixed button would take a line of it on every screen. `navigate`, not
          `push`, so from a history in another tab it opens the check tab's own
          form instead of stacking a second one here. */}
      <Button
        title={ui.result.newCheck}
        kind="secondary"
        onPress={() => router.navigate('/check')}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  visit: { marginTop: space.row },
  checkedAt: { marginBottom: space.row },
  answer: { marginTop: space.row, gap: 2 },
})
