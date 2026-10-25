import { useCallback, useRef, useState } from 'react'
import { Linking, StyleSheet, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams, useSegments } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { withFreshSession } from '@/lib/api'
import { useCached } from '@/lib/query-cache'
import { describeFailure } from '@/lib/errors'
import { dictionary, useText } from '@/i18n'
import { urgencyText, type UrgencyLevel } from '@/features/checks/urgency'
import { checkAnswers, formatCheckedAt, offersVisit, photoObservations, visitFormHref, clinicSearchUrl, offersClinicSearch } from '@/features/checks/check-answers'
import { ResultFeedback } from '@/features/checks/ResultFeedback'
import { FollowupOffer } from '@/features/followup/FollowupOffer'
import { reviewAfterCheck } from '@/features/review/store-review'
import { Button, LinkButton } from '@/ui/Button'
import { Banner, UrgencyCard } from '@/ui/Card'
import { Screen } from '@/ui/Screen'
import { Bullets, SummaryCard } from '@/ui/Section'
import { ResultSkeleton } from '@/ui/Skeleton'
import { Text } from '@/ui/Text'
import { space } from '@/ui/theme'

/**
 * One finished check, read back.
 *
 * Every tab that lists checks has its own route to this, so opening a result
 * from the history stays in that tab's stack. Pointing them all at the check
 * tab switched tabs first, and the new-check form flashed past on the way.
 */
export function CheckResult({ id }: { id: string }) {
  const ui = useText()
  // ['(tabs)', 'check' | 'profile' | 'pets', ...]: the tab this result was opened in.
  const tab = (useSegments() as string[])[1]
  // A finished check does not change, so the cached one is shown at once;
  // the history has usually put it there already (see CheckHistory).
  const result = useCached(['check', id], () => withFreshSession((api) => api.getCheck(id)))
  const check = result.data
  const error = result.error ? describeFailure(ui, result.error, ui.common.offline) : null
  const load = result.reload
  const [copied, setCopied] = useState(false)
  // Only an answer that has just arrived, not one reopened from the history.
  const { fresh } = useLocalSearchParams<{ fresh?: string }>()
  useReviewAfterResult(fresh === '1' && check ? check.urgency : null)

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
            {/* In the pets tab the list is under this screen: back down to it, not a second list on top. */}
            <LinkButton
              title={ui.common.toPets}
              onPress={() => (tab === 'pets' ? router.dismissTo('/pets') : router.replace('/pets'))}
            />
          </>
        ) : (
          <ResultSkeleton />
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
  // «Напомнить, как …?»: before the advice when watching at home is the plan,
  // after the visit when the plan is a vet — it must not compete with the clinic.
  const followupFirst = check.urgency === 'monitor' || check.urgency === 'home_care'

  return (
    <Screen title={check.pet_name ?? t.result.fallbackTitle} onBack={() => router.back()} scroll>
      <Text variant="caption" tone="faint" style={styles.checkedAt}>
        {formatCheckedAt(check.created_at, check.locale)}
      </Text>

      {/* What was asked comes first, open: reading the advice meant scrolling
          down to recall the question and back up again (FB-1/04). */}
      <SummaryCard style={styles.described}>
        <Text variant="label" tone="faint">
          {t.result.youDescribed}
        </Text>
        <Text>{check.symptoms_input}</Text>
        {/* One line, so the answer itself still starts on the first screen. */}
        {answers.length > 0 ? (
          <Text variant="label" tone="muted" style={styles.answers}>
            {answers.map((answer) => `${answer.label}: ${lowerFirst(answer.value)}`).join(' · ')}
          </Text>
        ) : null}
      </SummaryCard>

      <UrgencyCard
        level={check.urgency}
        icon={level.icon}
        label={level.label}
        action={level.action}
        reason={check.urgency_reason}
      />

      {/* On the way to a vet: where the nearest one is, before anything else to read. */}
      {offersClinicSearch(check.urgency) ? (
        <View style={styles.clinic}>
          <Button
            title={ui.result.findClinic}
            onPress={() => void Linking.openURL(clinicSearchUrl(ui.result.clinicSearchQuery))}
          />
        </View>
      ) : null}

      {check.species_specific_warning ? (
        <Banner text={check.species_specific_warning} tone="note" />
      ) : null}

      {followupFirst ? <FollowupOffer check={check} /> : null}

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

      <Banner text={t.result.disclaimer} />

      {offersVisit(check) ? (
        <View style={styles.visit}>
          <Button
            title={ui.medicalRecord.visits.fromResult}
            kind="secondary"
            onPress={() => router.push(visitFormHref(tab, check))}
          />
        </View>
      ) : null}

      {followupFirst ? null : <FollowupOffer check={check} />}

      <ResultFeedback checkId={check.id} />

      {/* At the end rather than docked: the answer is the thing to read, and a
          fixed button would take a line of it on every screen. From another
          tab, `navigate` opens the check tab's own form. In the check tab the
          form is already under this result, so it is gone back to: `navigate`
          stacked a second form on top, and every round added one more. */}
      <Button
        title={ui.result.newCheck}
        kind="secondary"
        onPress={() => (tab === 'check' ? router.dismissTo('/check') : router.navigate('/check'))}
      />
    </Screen>
  )
}

/** How long a fresh answer is on screen before the rating sheet may cover it. */
const READ_FIRST_MS = 3000

/**
 * The store's rating sheet over a fresh result, once it has been seen. Left
 * before that, nothing is asked; the rules decide whether the answer is one to
 * ask after at all (never an urgent one).
 */
function useReviewAfterResult(urgency: UrgencyLevel | null) {
  const done = useRef(false)
  useFocusEffect(
    useCallback(() => {
      if (!urgency || done.current) return
      const timer = setTimeout(() => {
        done.current = true
        void reviewAfterCheck(urgency)
      }, READ_FIRST_MS)
      return () => clearTimeout(timer)
    }, [urgency]),
  )
}

const styles = StyleSheet.create({
  // A button carries no margin of its own; the feedback block under it would
  // otherwise sit flush against its border.
  visit: { marginBottom: space.block },
  checkedAt: { marginBottom: space.row },
  clinic: { marginTop: -space.row, marginBottom: space.block },
  described: { flexDirection: 'column', alignItems: 'stretch', gap: 4 },
  answers: { marginTop: 4 },
})

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}
