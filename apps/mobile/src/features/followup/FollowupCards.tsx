import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router, useSegments } from 'expo-router'
import type { FollowupCaseSummary } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { useCached } from '@/lib/query-cache'
import { useText } from '@/i18n'
import { urgencyText } from '@/features/checks/urgency'
import { Button, LinkButton } from '@/ui/Button'
import { Card, UrgencyBadge } from '@/ui/Card'
import { Text } from '@/ui/Text'
import { colour, radius, space } from '@/ui/theme'
import { useFollowupChanged } from './cache'
import { askWhen, caseHref, checkDay, dueCards, isDue, tomorrowMorning } from './followup-ui'

/** The owner's open cases, shared by the pet list and every pet card. */
export function useFollowups() {
  return useCached(['followups'], () => withFreshSession((api) => api.listFollowups()))
}

/**
 * «Как Мурка после проверки 23 октября?» above the pet list: one per pet whose
 * question has come. Nothing at all when none has — no empty card.
 */
export function FollowupDueCards() {
  const loaded = useFollowups()
  const items = loaded.data ? dueCards(loaded.data.items) : []
  if (items.length === 0) return null
  return (
    <View>
      {items.map((item) => (
        <DueCard key={item.id} item={item} />
      ))}
    </View>
  )
}

function DueCard({ item }: { item: FollowupCaseSummary }) {
  const t = useText()
  const words = t.followup
  const changed = useFollowupChanged()
  const [hidden, setHidden] = useState(false)
  if (hidden) return null

  function hide() {
    // Gone from here at once; the server keeps it hidden on the site and the other phone.
    setHidden(true)
    void withFreshSession((api) => api.snoozeFollowup(item.id, tomorrowMorning().toISOString()))
      .then(changed)
      .catch(() => setHidden(false))
  }

  const escalated = item.escalation !== 'none'
  return (
    <View style={styles.due} accessibilityRole="summary">
      <Text variant="caption" style={styles.kicker}>
        {words.cardKicker.toUpperCase()}
      </Text>
      <Text variant="h2" style={styles.dueTitle}>
        {words.cardTitle(item.pet_name, checkDay(t, item.origin_checked_at))}
      </Text>
      <Text tone={escalated ? 'danger' : 'muted'} style={styles.dueBody}>
        {escalated ? words.cardEscalated : words.cardBody}
      </Text>
      <Button
        title={words.cardAction}
        onPress={() => router.push(caseHref('pets', item.pet_id, item.id, 'checkin', { from: 'pets_list' }) as never)}
      />
      <LinkButton title={words.hide} onPress={hide} />
    </View>
  )
}

/** «Наблюдаем» on a pet's card: its open case, when the next question is, a way to answer now. */
export function PetFollowup({ petId }: { petId: string }) {
  const t = useText()
  const words = t.followup
  const tab = (useSegments() as string[])[1]
  const loaded = useFollowups()
  const item = loaded.data?.items.find((candidate) => candidate.pet_id === petId) ?? null
  if (!item) return null

  const due = isDue({ ...item, hidden_until: null })
  const level = urgencyText(t, item.current_urgency)
  return (
    <Card outlined style={styles.pet}>
      <Text variant="h2">{words.watchingTitle}</Text>
      <View style={styles.badge}>
        <UrgencyBadge level={item.current_urgency} label={level.label} />
      </View>
      <Text>{words.watchingCheck(checkDay(t, item.origin_checked_at))}</Text>
      {item.escalation !== 'none' ? (
        <Text variant="label" tone="danger" style={styles.small}>
          {words.cardEscalated}
        </Text>
      ) : null}
      <Text variant="label" tone="faint" style={styles.small}>
        {due || !item.next_due_at ? words.watchingDue : words.watchingNext(askWhen(t, item.next_due_at))}
      </Text>
      {due ? (
        <Button
          title={words.cardAction}
          kind="secondary"
          style={styles.action}
          onPress={() => router.push(caseHref(tab, petId, item.id, 'checkin', { from: 'pet_card' }) as never)}
        />
      ) : null}
      <LinkButton title={words.timelineLink} onPress={() => router.push(caseHref(tab, petId, item.id) as never)} />
    </Card>
  )
}

const styles = StyleSheet.create({
  due: {
    backgroundColor: colour.accentSoft,
    borderRadius: radius.card,
    padding: 20,
    marginBottom: space.block,
  },
  kicker: { color: colour.accentText, fontWeight: '700', letterSpacing: 0.5 },
  dueTitle: { marginTop: 6 },
  dueBody: { marginTop: 6, marginBottom: space.block },
  pet: { padding: 20, marginBottom: space.block },
  badge: { flexDirection: 'row', marginTop: 8, marginBottom: 8 },
  small: { marginTop: 6 },
  action: { marginTop: space.row },
})
