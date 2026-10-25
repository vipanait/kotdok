import { useState } from 'react'
import { Image, Linking, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import type { FollowupCase, FollowupCheckinResult } from '@lapka/contracts'
import { followupScheduleFor } from '@lapka/shared'
import { withFreshSession } from '@/lib/api'
import { useCached } from '@/lib/query-cache'
import { queryKeys } from '@/lib/query-keys'
import { describeFailure } from '@/lib/errors'
import { useText } from '@/i18n'
import { clinicSearchUrl, visitFormHref } from '@/features/checks/check-answers'
import { askRecheck } from './recheck-request'
import { Button, LinkButton } from '@/ui/Button'
import { Banner, Card } from '@/ui/Card'
import { Screen } from '@/ui/Screen'
import { Bullets } from '@/ui/Section'
import { Text } from '@/ui/Text'
import { colour, radius, space, urgency as urgencyScale } from '@/ui/theme'
import { useFollowupChanged } from './cache'
import { askWhen } from './followup-ui'
import { MOODS } from './moods'

/**
 * What comes after an answer — the rule's decision, as the server returned
 * it. Fixed words, no model: «к врачу» never depends on a generated sentence.
 */
export function FollowupOutcome({
  theCase,
  result,
  tab,
}: {
  theCase: FollowupCase
  result: FollowupCheckinResult
  tab: string | undefined
}) {
  const t = useText()
  const words = t.followup
  const decision = result.checkin.decision
  const pet = theCase.pet_name
  const latest = theCase.checks.at(-1) ?? null

  return (
    <Screen title={words.savedTitle} onBack={() => router.back()} scroll>
      {decision === 'close_improved' ? (
        <Improved caseId={theCase.id} species={theCase.pet_species} pet={pet} saved={result.case.saved_to_record_at !== null} />
      ) : decision === 'keep_watching' ? (
        <KeepWatching nextDueAt={result.case.next_due_at} checkId={latest?.check_id ?? null} />
      ) : decision === 'vet_seen' ? (
        <>
          <Text variant="h2" style={styles.title}>
            {words.vetSeenTitle}
          </Text>
          <Text tone="muted" style={styles.body}>
            {words.vetSeenBody}
          </Text>
          {latest ? (
            <Button
              title={words.recordVisit}
              onPress={() =>
                router.push(visitFormHref(tab, { id: latest.check_id, pet_id: theCase.pet_id, symptoms_input: latest.symptoms }) as never)
              }
            />
          ) : null}
          <LinkButton title={words.later} onPress={() => router.back()} />
        </>
      ) : (
        <SeeVet theCase={theCase} result={result} tab={tab} />
      )}
    </Screen>
  )
}

function Improved({ caseId, species, pet, saved: savedBefore }: { caseId: string; species: 'cat' | 'dog'; pet: string; saved: boolean }) {
  const t = useText()
  const words = t.followup
  const changed = useFollowupChanged()
  const [saved, setSaved] = useState(savedBefore)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await withFreshSession((api) => api.saveFollowupToRecord(caseId))
      setSaved(true)
      changed()
    } catch (cause) {
      setError(describeFailure(t, cause, words.sendFailed).text)
    } finally {
      setSaving(false)
    }
  }

  return (
    <View>
      <Image source={MOODS[species].better} style={styles.hero} accessible={false} resizeMode="contain" />
      <Text variant="h1" center style={styles.title}>
        {words.improvedTitle(pet)}
      </Text>
      <Text tone="muted" center style={styles.body}>
        {words.improvedBody}
      </Text>
      <Card outlined>
        {saved ? (
          <Text variant="bodyStrong" tone="accent" accessibilityLiveRegion="polite">
            {`✓ ${words.saved}`}
          </Text>
        ) : (
          <>
            <Text variant="h3">{words.saveTitle}</Text>
            <Text tone="muted" style={styles.cardBody}>
              {words.saveBody}
            </Text>
            {error ? <Banner text={error} tone="error" style={styles.cardBody} /> : null}
            <Button title={words.save} busy={saving} onPress={() => void save()} />
          </>
        )}
      </Card>
      {saved ? (
        <Button title={words.ok} kind="secondary" onPress={() => router.back()} />
      ) : (
        <LinkButton title={words.noThanks} onPress={() => router.back()} />
      )}
    </View>
  )
}

function KeepWatching({ nextDueAt, checkId }: { nextDueAt: string | null; checkId: string | null }) {
  const t = useText()
  const words = t.followup
  // The home care of the check the case now follows; a failed read just leaves it out.
  const check = useCached(checkId ? queryKeys.check(checkId) : ['check', 'none'], () =>
    checkId ? withFreshSession((api) => api.getCheck(checkId)) : Promise.resolve(null),
  )
  return (
    <View>
      <Text variant="h2" style={styles.title}>
        {words.keepTitle}
      </Text>
      {nextDueAt ? (
        <Text tone="muted" style={styles.body}>
          {words.keepBody(askWhen(t, nextDueAt))}
        </Text>
      ) : null}
      {check.data && check.data.home_care_steps.length > 0 ? (
        <Bullets title={words.keepHomeCare} items={check.data.home_care_steps} />
      ) : null}
      <Button title={words.ok} onPress={() => router.back()} style={styles.after} />
    </View>
  )
}

function SeeVet({ theCase, result, tab }: { theCase: FollowupCase; result: FollowupCheckinResult; tab: string | undefined }) {
  const t = useText()
  const words = t.followup
  const decision = result.checkin.decision
  const pet = theCase.pet_name
  const latest = theCase.checks.at(-1) ?? null
  const me = useCached(queryKeys.me(), () => withFreshSession((api) => api.getMe()))
  const credits = me.data?.credits ?? null
  // «Не прошло за N дней» counts the schedule the case was on.
  const finalHours = followupScheduleFor(theCase.current_urgency)?.slots.at(-1)?.afterHours ?? 48
  const notYet = result.checkin.vet_visited === false

  const title =
    decision === 'clinic_now' ? words.clinicNowTitle : decision === 'see_vet' ? words.seeVetTitle(pet) : words.todayTitle(pet)
  const body =
    decision === 'clinic_now'
      ? words.clinicNowBody
      : decision === 'see_vet'
        ? words.seeVetBody(Math.round(finalHours / 24))
        : notYet
          ? `${words.todayBody} ${words.notYetBody}`
          : words.todayBody

  const tone = urgencyScale[decision === 'clinic_now' ? 'emergency' : 'urgent']

  return (
    <View>
      <View style={[styles.advice, { backgroundColor: tone.background }]} accessibilityRole="alert">
        <Text variant="h2">{title}</Text>
        <Text style={styles.cardBody}>{body}</Text>
      </View>
      <Button title={words.findClinic} onPress={() => void Linking.openURL(clinicSearchUrl(t.result.clinicSearchQuery))} />
      {latest ? (
        <Button
          title={words.recordVisit}
          kind="secondary"
          style={styles.next}
          onPress={() =>
            router.push(visitFormHref(tab, { id: latest.check_id, pet_id: theCase.pet_id, symptoms_input: latest.symptoms }) as never)
          }
        />
      ) : null}
      {credits === null ? null : credits > 0 ? (
        <View style={styles.recheck}>
          <LinkButton
            title={words.recheck}
            onPress={() => {
              askRecheck({ caseId: theCase.id, petId: theCase.pet_id })
              router.navigate('/check' as never)
            }}
          />
          <Text variant="caption" tone="faint" center>
            {words.recheckPrice(credits)}
          </Text>
        </View>
      ) : (
        <View style={styles.recheck}>
          <Text variant="label" tone="muted" center>
            {words.noChecks}
          </Text>
          <LinkButton
            title={words.requestMore}
            onPress={() => router.push((tab === 'check' ? '/check/extra-check' : '/profile/extra-check') as never)}
          />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  hero: { width: 130, height: 130, alignSelf: 'center', marginBottom: space.row },
  title: { marginBottom: 8 },
  body: { marginBottom: space.block },
  cardBody: { marginTop: 8, marginBottom: space.row },
  advice: { borderRadius: radius.card, padding: 20, marginBottom: space.block, borderWidth: 1, borderColor: colour.line },
  next: { marginTop: space.row },
  after: { marginTop: space.block },
  recheck: { marginTop: space.block, gap: 4 },
})
