import { useState } from 'react'
import { Linking } from 'react-native'
import type { HealthEvent } from '@lapka/contracts'
import { useText } from '@/i18n'
import { LinkButton } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { calendarLink, calendarTitle } from './calendar-link'
import { duePhrase } from './due'

/**
 * «Добавить в календарь» under a planned record (FB-3/01): opens the Google
 * Calendar app or site with the event filled in. A link that cannot be
 * opened says so instead of failing quietly.
 */
export function AddToCalendar({ petName, event }: { petName: string; event: HealthEvent }) {
  const t = useText()
  const [failed, setFailed] = useState(false)

  const first = event.items[0]
  const what =
    event.kind === 'visit'
      ? t.medicalRecord.visits.dueTitle.toLowerCase()
      : duePhrase(t, { kind: event.kind, name: first?.name ?? null, targets: first?.targets ?? [] }).text

  async function open() {
    setFailed(false)
    try {
      await Linking.openURL(
        calendarLink({ title: calendarTitle(t, petName, what), date: event.date, location: event.clinic, details: event.notes }),
      )
    } catch {
      setFailed(true)
    }
  }

  return (
    <>
      <LinkButton title={t.calendarEvent.add} align="left" onPress={() => void open()} />
      {failed ? <Banner text={t.calendarEvent.failed} tone="error" /> : null}
    </>
  )
}
