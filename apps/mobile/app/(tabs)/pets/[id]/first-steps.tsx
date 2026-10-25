import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import type { Pet, VaccineTarget } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { localToday } from '@/lib/calendar-day'
import { newRequestKey } from '@/lib/request-key'
import { useText } from '@/i18n'
import {
  UNKNOWN,
  coreTargets,
  firstStepsRequests,
  type FirstStepsDraft,
  type LastVisit,
  type VaccineChoice,
} from '@/features/pets/first-steps'
import { useRecordChanged } from '@/features/medical-record/record-cache'
import { Button, LinkButton } from '@/ui/Button'
import { Banner, Card } from '@/ui/Card'
import { DateField } from '@/ui/DateField'
import { Chips, Select } from '@/ui/Field'
import { Screen } from '@/ui/Screen'
import { FormSkeleton } from '@/ui/Skeleton'
import { Text } from '@/ui/Text'
import { space } from '@/ui/theme'

const LAST_VISITS: LastVisit[] = ['thisYear', 'overYear', 'never', 'unknown']

/**
 * After a new pet's form (FB-2/03, FB-2/04): the core vaccinations it has had
 * and when, and when it last saw a vet. Everything may be skipped. A ticked
 * vaccination with a day becomes a done record with its next date; without a
 * day only the form's «привит(а)» is set. «Ни разу» or «больше года» offers
 * to plan a checkup — an offer, not advice.
 */
export default function FirstSteps() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useText()
  const words = t.firstSteps
  const changed = useRecordChanged()
  const [pet, setPet] = useState<Pet | null>(null)
  const [draft, setDraft] = useState<FirstStepsDraft>({ vaccines: [], dates: {}, lastVisit: null })
  const [wrongDate, setWrongDate] = useState<VaccineTarget | null>(null)
  const [error, setError] = useState<{ text: string; offline: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [offer, setOffer] = useState(false)
  /**
   * One key per record body for the life of the screen: a second «Готово»
   * repeats what was sent, it does not add — and an edited record is a new
   * body with a new key, never an old key with different data (a 409).
   */
  const keys = useRef(new Map<string, string>())
  /** What already went through, so a retry after a failure sends only the rest. */
  const sent = useRef(new Set<string>())

  // The pet is already saved: a failed load says so, and offers a retry and a way on.
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    setError(null)
    withFreshSession((api) => api.getPet(id))
      .then(setPet)
      .catch((cause) => setError(describeFailure(t, cause, t.errors.loadPetFailed)))
  }, [id, t, attempt])

  const toPet = () => router.replace(`/pets/${id}`)

  function toggle(choice: VaccineChoice) {
    setWrongDate(null)
    setDraft((current) => {
      if (choice === UNKNOWN) return { ...current, vaccines: current.vaccines.includes(UNKNOWN) ? [] : [UNKNOWN] }
      const without = current.vaccines.filter((value) => value !== UNKNOWN && value !== choice)
      return { ...current, vaccines: current.vaccines.includes(choice) ? without : [...without, choice] }
    })
  }

  async function save() {
    if (!pet) return
    const today = localToday()
    const read = firstStepsRequests(draft, today)
    if (!read.ok) {
      setWrongDate(read.target)
      return
    }
    setBusy(true)
    setError(null)
    try {
      // «Привит(а)» first: the form's answer is stored as the owner's only
      // while the record has not yet set the same value (FB-2 review).
      if (read.vaccinatedWithoutDate && pet.vaccinated !== true && !sent.current.has('vaccinated')) {
        // A partial update: only «привит(а)» changes (#81).
        await withFreshSession((api) => api.updatePet(id, { vaccinated: true }))
        sent.current.add('vaccinated')
      }
      for (const event of read.events) {
        // Only the vaccinations of this day not yet recorded: one added to a
        // day that already went through is not recorded twice.
        const items = event.items.filter((item) => !sent.current.has(`${event.date}:${item.targets.join()}`))
        if (items.length === 0) continue
        const rest = { ...event, items }
        const body = JSON.stringify(rest)
        if (!keys.current.has(body)) keys.current.set(body, newRequestKey())
        const key = keys.current.get(body)!
        await withFreshSession((api) => api.createHealthEvent(id, rest, key))
        for (const item of items) sent.current.add(`${event.date}:${item.targets.join()}`)
      }
      void changed(id)
      if (read.offerCheckup) setOffer(true)
      else toPet()
    } catch (cause) {
      setError(describeFailure(t, cause, words.saveFailed))
    } finally {
      setBusy(false)
    }
  }

  if (!pet) {
    return (
      <Screen title={words.title} onBack={toPet}>
        {error ? (
          <>
            <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} />
            <Button title={t.common.retry} onPress={() => setAttempt((count) => count + 1)} />
            <LinkButton title={words.skip} onPress={toPet} />
          </>
        ) : (
          <FormSkeleton fields={3} />
        )}
      </Screen>
    )
  }

  if (offer) {
    return (
      <Screen title={words.title} scroll>
        <Card style={styles.offer}>
          <Text variant="h3">{words.checkupTitle}</Text>
          <Text tone="muted">{words.checkupBody}</Text>
          <Button
            title={words.checkupPlan}
            onPress={() => {
              toPet()
              router.push(`/pets/${id}/visit-form?plan=checkup`)
            }}
          />
          <LinkButton title={words.notNow} onPress={toPet} />
        </Card>
      </Screen>
    )
  }

  const chosen = draft.vaccines.filter((choice): choice is VaccineTarget => choice !== UNKNOWN)
  const names = t.medicalRecord.targets as Record<string, string>

  return (
    <Screen
      title={words.title}
      scroll
      dock={
        <>
          <Button title={words.done} onPress={() => void save()} busy={busy} />
          <LinkButton title={words.skip} onPress={toPet} />
        </>
      }
    >
      <Chips
        label={words.vaccines}
        options={[
          ...coreTargets(pet.species).map((target) => ({ value: target as VaccineChoice, label: names[target] ?? target })),
          { value: UNKNOWN, label: words.unknown },
        ]}
        values={draft.vaccines}
        onToggle={toggle}
      />
      <Text variant="caption" tone="muted" style={styles.hint}>
        {words.vaccinesHint}
      </Text>

      {chosen.map((target) => (
        <DateField
          key={target}
          label={words.vaccineDate(names[target] ?? target)}
          value={draft.dates[target] ?? ''}
          onChangeText={(text) => {
            setWrongDate(null)
            setDraft((current) => ({ ...current, dates: { ...current.dates, [target]: text } }))
          }}
          placeholder={t.medicalRecord.datePlaceholder}
          max={localToday()}
          error={wrongDate === target ? t.validation.dayPast : null}
        />
      ))}
      {chosen.some((target) => !(draft.dates[target] ?? '').trim()) ? (
        <Text variant="caption" tone="muted" style={styles.hint}>
          {words.noDateNote}
        </Text>
      ) : null}

      <View style={styles.visit}>
        <Select
          label={words.lastVisit}
          options={LAST_VISITS.map((value) => ({ value, label: words.lastVisits[value] }))}
          value={draft.lastVisit}
          onChange={(lastVisit) => setDraft((current) => ({ ...current, lastVisit }))}
        />
      </View>

      {error ? <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} /> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  hint: { marginTop: -8, marginBottom: space.block },
  visit: { marginTop: space.row },
  offer: { gap: space.row },
})
