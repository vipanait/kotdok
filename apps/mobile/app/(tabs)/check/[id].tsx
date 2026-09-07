import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import type { SymptomCheckRecord } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { urgencyText } from '@/features/checks/urgency'
import { LinkButton } from '@/ui/Button'
import { Banner, UrgencyCard } from '@/ui/Card'
import { Screen } from '@/ui/Screen'
import { Accordion, Bullets } from '@/ui/Section'
import { Text } from '@/ui/Text'
import { colour } from '@/ui/theme'

export default function CheckResult() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [check, setCheck] = useState<SymptomCheckRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      setCheck(await withFreshSession((api) => api.getCheck(id)))
    } catch (cause) {
      setError(errorMessage(cause, 'Не удалось загрузить проверку'))
    }
  }, [id])

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
      <Screen title="Проверка" onBack={() => router.back()}>
        {error ? <Banner text={error} tone="error" /> : <ActivityIndicator color={colour.accent} />}
        {error ? <LinkButton title="К питомцам" onPress={() => router.replace('/pets')} /> : null}
      </Screen>
    )
  }

  const level = urgencyText[check.urgency]

  return (
    <Screen title={check.pet_name ?? 'Проверка'} onBack={() => router.back()} scroll>
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

      <Bullets title="Возможные причины" items={check.possible_causes} />
      <Bullets title="Что можно сделать дома" items={check.home_care_steps} />
      <Bullets title="О чём спросить врача" items={check.vet_questions} />

      {check.vet_questions.length > 0 ? (
        <LinkButton
          title={copied ? 'Скопировано' : 'Скопировать'}
          align="left"
          onPress={() => void copyQuestions()}
        />
      ) : null}

      <Accordion title="Что вы описали" soft>
        <Text tone="muted">{check.symptoms_input}</Text>
      </Accordion>

      <Banner text="Это не диагноз. Решение о лечении принимает только ветеринарный врач." />
    </Screen>
  )
}
