import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import type { SymptomCheckRecord } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { dictionary, useText } from '@/i18n'
import { urgencyText } from '@/features/checks/urgency'
import { LinkButton } from '@/ui/Button'
import { Banner, UrgencyCard } from '@/ui/Card'
import { Screen } from '@/ui/Screen'
import { Accordion, Bullets } from '@/ui/Section'
import { Text } from '@/ui/Text'
import { colour } from '@/ui/theme'

export default function CheckResult() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const ui = useText()
  const [check, setCheck] = useState<SymptomCheckRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      setCheck(await withFreshSession((api) => api.getCheck(id)))
    } catch (cause) {
      setError(errorMessage(ui, cause, ui.common.offline))
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
        {error ? <Banner text={error} tone="error" /> : <ActivityIndicator color={colour.accent} />}
        {error ? (
          <LinkButton title={ui.common.toPets} onPress={() => router.replace('/pets')} />
        ) : null}
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

  return (
    <Screen title={check.pet_name ?? t.result.fallbackTitle} onBack={() => router.back()} scroll>
      <UrgencyCard
        level={check.urgency}
        icon={level.icon}
        label={level.label}
        action={level.action}
        reason={check.urgency_reason}
      />

      {check.species_specific_warning ? (
        <Banner text={check.species_specific_warning} tone="error" />
      ) : null}

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
      </Accordion>

      <Banner text={t.result.disclaimer} />
    </Screen>
  )
}
