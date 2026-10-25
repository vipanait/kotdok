import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router, useSegments } from 'expo-router'
import type { FollowupCase } from '@lapka/contracts'
import { ApiError } from '@lapka/shared'
import { withFreshSession } from '@/lib/api'
import { useCached } from '@/lib/query-cache'
import { describeFailure } from '@/lib/errors'
import { useText, type Dictionary } from '@/i18n'
import { urgencyText } from '@/features/checks/urgency'
import { Button, LinkButton } from '@/ui/Button'
import { Banner, Card } from '@/ui/Card'
import { ConfirmDialog } from '@/ui/Dialog'
import { Screen } from '@/ui/Screen'
import { DetailSkeleton } from '@/ui/Skeleton'
import { Text } from '@/ui/Text'
import { colour, radius, space } from '@/ui/theme'
import { useFollowupChanged } from './cache'
import { askWhen, caseHref, caseStatusWord, localDay } from './followup-ui'

type Event = {
  at: string
  /** How the moment reads: a visit has a day only, the rest a day and a time. */
  when: string
  title: string
  body?: string
  link?: { title: string; href: string }
}

/** «23 октября · 09:00» on the phone's clock. */
export function stamp(t: Dictionary, iso: string): string {
  const moment = new Date(iso)
  const time = `${String(moment.getHours()).padStart(2, '0')}:${String(moment.getMinutes()).padStart(2, '0')}`
  return `${t.day(localDay(moment), false)} · ${time}`
}

/** Checks, answers, visits and the closing, in the order they happened. */
export function timelineEvents(t: Dictionary, theCase: FollowupCase, tab: string | undefined): Event[] {
  const words = t.followup
  const checkHref = (checkId: string) =>
    tab === 'profile' ? `/profile/check/${checkId}` : tab === 'check' ? `/check/${checkId}` : `/pets/${theCase.pet_id}/check/${checkId}`
  const events: Event[] = [
    ...theCase.checks.map((check) => ({
      at: check.created_at,
      when: stamp(t, check.created_at),
      title: check.kind === 'origin' ? words.eventCheck : words.eventRecheck,
      body: check.kind === 'origin' ? check.symptoms : urgencyText(t, check.urgency).label,
      link: { title: words.openResult, href: checkHref(check.check_id) },
    })),
    ...theCase.checkins.map((checkin) => ({
      at: checkin.created_at,
      when: stamp(t, checkin.created_at),
      title: words[checkin.state],
      body: [checkin.vet_visited === null ? null : words.vetSaid(checkin.vet_visited), checkin.note].filter(Boolean).join('. ') || undefined,
    })),
    ...theCase.visits.map((visit) => ({
      // A visit has a day, not a moment: noon sorts it among the day's
      // events, but only the day is shown — no time was ever given.
      at: `${visit.date}T12:00:00`,
      when: t.day(visit.date, false),
      title: visit.status === 'done' ? words.eventVisit : words.eventVisitPlanned,
      body: visit.clinic ?? undefined,
      link: { title: words.openVisit, href: `/pets/${theCase.pet_id}/visit/${visit.event_id}` },
    })),
  ]
  if (theCase.status === 'closed' && theCase.closed_at) {
    events.push({ at: theCase.closed_at, when: stamp(t, theCase.closed_at), title: words.eventClosed, body: caseStatusWord(t, theCase) })
  }
  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
}

/** One case from its first check to its end, with what can still be done about it. */
export function CaseTimeline({ caseId }: { caseId: string }) {
  const t = useText()
  const words = t.followup
  const tab = (useSegments() as string[])[1]
  const loaded = useCached(['followup', caseId], () => withFreshSession((api) => api.getFollowup(caseId)))
  const theCase = loaded.data
  const changed = useFollowupChanged()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function act(work: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await work()
      changed()
      await loaded.reload()
    } catch (cause) {
      setError(describeFailure(t, cause, words.sendFailed).text)
    } finally {
      setBusy(false)
    }
  }

  if (!theCase) {
    const notFound = loaded.error instanceof ApiError && loaded.error.code === 'not_found'
    const failure = loaded.error ? describeFailure(t, loaded.error, t.common.offline) : null
    return (
      <Screen title={words.timelineTitle} onBack={() => router.back()} scroll>
        {notFound ? (
          <>
            <Text variant="h2" style={styles.header}>
              {words.notFound}
            </Text>
            <Button title={t.common.toPets} kind="secondary" onPress={() => router.dismissTo('/pets')} />
          </>
        ) : failure ? (
          <>
            <Banner text={failure.text} tone="error" icon={failure.offline ? 'wifi' : 'alert'} />
            <Button title={t.common.retry} kind="secondary" onPress={() => void loaded.reload()} />
          </>
        ) : (
          <DetailSkeleton facts={4} />
        )}
      </Screen>
    )
  }

  const events = timelineEvents(t, theCase, tab)
  const first = localDay(new Date(theCase.origin_checked_at))
  const last = events.length > 0 ? localDay(new Date(events.at(-1)!.at)) : null
  const range = t.followup.timelineHeader(theCase.pet_name, t.day(first, false), last ? t.day(last, false) : null)
  const open = theCase.status === 'active'

  return (
    <Screen title={words.timelineTitle} onBack={() => router.back()} scroll>
      <Text tone="muted" style={styles.header}>
        {range}
      </Text>
      <View style={[styles.status, open ? styles.statusOpen : styles.statusClosed]}>
        <Text variant="caption" style={styles.statusText}>
          {caseStatusWord(t, theCase)}
        </Text>
      </View>

      <Card outlined style={styles.feed}>
        {events.map((event, index) => (
          <View key={`${event.at}-${index}`} style={styles.event}>
            <View style={styles.rail}>
              <View style={styles.dot} />
              {index < events.length - 1 ? <View style={styles.line} /> : null}
            </View>
            <View style={styles.eventText}>
              <Text variant="caption" tone="faint">
                {event.when}
              </Text>
              <Text variant="h3">{event.title}</Text>
              {event.body ? <Text tone="muted">{event.body}</Text> : null}
              {event.link ? <LinkButton title={event.link.title} align="left" onPress={() => router.push(event.link!.href as never)} /> : null}
            </View>
          </View>
        ))}
        {theCase.checkins.length === 0 && open && theCase.next_due_at ? (
          <Text tone="muted">{words.emptyTimeline(askWhen(t, theCase.next_due_at))}</Text>
        ) : null}
      </Card>

      {error ? <Banner text={error} tone="error" style={styles.gap} /> : null}

      {open ? (
        <>
          <Button
            title={words.checkNow}
            onPress={() => router.push(caseHref(tab, theCase.pet_id, theCase.id, 'checkin', { from: 'timeline' }) as never)}
          />
          <LinkButton title={words.stop} onPress={() => setConfirming(true)} disabled={busy} />
        </>
      ) : theCase.outcome === 'improved' && theCase.saved_to_record_at === null ? (
        <Button title={words.save} busy={busy} onPress={() => void act(() => withFreshSession((api) => api.saveFollowupToRecord(theCase.id)))} />
      ) : theCase.saved_to_record_at !== null ? (
        <Text variant="bodyStrong" tone="accent" center>{`✓ ${words.saved}`}</Text>
      ) : null}

      <ConfirmDialog
        visible={confirming}
        title={words.stopTitle}
        message={words.stopBody}
        confirmTitle={words.stopConfirm}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false)
          void act(() => withFreshSession((api) => api.dismissFollowup(theCase.id)))
        }}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { marginBottom: space.row },
  status: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, marginBottom: space.block },
  statusOpen: { backgroundColor: colour.soft },
  statusClosed: { backgroundColor: colour.accentSoft },
  statusText: { fontWeight: '700', color: colour.accentText },
  feed: { paddingVertical: 20, marginBottom: space.block },
  event: { flexDirection: 'row', gap: 16 },
  rail: { width: 10, alignItems: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colour.accent, marginTop: 4 },
  line: { flex: 1, width: 1, backgroundColor: colour.line, marginTop: 4 },
  eventText: { flex: 1, paddingBottom: space.block, gap: 2 },
  gap: { marginBottom: space.row },
})
