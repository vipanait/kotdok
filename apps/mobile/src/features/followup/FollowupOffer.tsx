import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Linking, Pressable, StyleSheet, Switch, View } from 'react-native'
import { router, useSegments } from 'expo-router'
import type { CheckFollowup, SymptomCheckRecord } from '@lapka/contracts'
import { followupScheduleFor } from '@lapka/shared'
import { withFreshSession } from '@/lib/api'
import { useCached } from '@/lib/query-cache'
import { useText } from '@/i18n'
import { askPermission, permissionState, type PermissionState } from '@/features/medical-record/reminders/notifications'
import { Button, LinkButton } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { Sheet } from '@/ui/Sheet'
import { CONTROL_FONT_LIMIT, Text } from '@/ui/Text'
import { TAP_TARGET, colour, space } from '@/ui/theme'
import { useFollowupChanged } from './cache'
import { askWhen, caseHref, checkDay } from './followup-ui'

/**
 * «Напомнить, как Мурка?» on a result. On by default for monitor and home
 * care; offered, off, for urgent and emergency; nothing for healthy or a check
 * older than twelve hours. The first showing records the offer (`off` or on),
 * so the statistics know who declined. The system's permission question comes
 * only from a tap on our own sheet.
 */
export function FollowupOffer({ check }: { check: SymptomCheckRecord }) {
  const t = useText()
  const words = t.followup
  const tab = (useSegments() as string[])[1]
  const loaded = useCached(['check-followup', check.id], () => withFreshSession((api) => api.getCheckFollowup(check.id)))
  const [state, setState] = useState<CheckFollowup | null>(null)
  const current = state ?? loaded.data
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [permission, setPermission] = useState<PermissionState | null>(null)
  const [asking, setAsking] = useState(false)
  const changed = useFollowupChanged()
  const recorded = useRef(false)

  const readPermission = useCallback(() => {
    void permissionState()
      .then(setPermission)
      .catch(() => setPermission(null))
  }, [])
  useEffect(() => {
    readPermission()
    // Back from Settings: the switch there may have changed.
    const subscription = AppState.addEventListener('change', (next) => next === 'active' && readPermission())
    return () => subscription.remove()
  }, [readPermission])

  const save = useCallback(
    async (enabled: boolean) => {
      setSaving(true)
      setFailed(false)
      try {
        const next = await withFreshSession((api) => api.setCheckFollowup(check.id, { enabled, via: 'mobile' }))
        setState(next)
        changed()
      } catch {
        setFailed(true)
      } finally {
        setSaving(false)
      }
    },
    [check.id, changed],
  )

  // The first showing of an offer stores it, on or off as the level says —
  // but never switches another open case of this pet off without asking.
  useEffect(() => {
    if (recorded.current || !current?.offer || current.case) return
    recorded.current = true
    void save(current.offer.default_enabled && current.offer.replaces === null)
  }, [current, save])

  if (!current) return null
  const theCase = current.case

  // A re-check, or a check whose offer has passed: a way into its case, no switch.
  if (!current.offer) {
    if (!theCase || theCase.status === 'off') return null
    return (
      <Card outlined style={styles.card}>
        <LinkButton
          title={words.partOf(checkDay(t, theCase.origin_checked_at), theCase.checkin_count)}
          align="left"
          onPress={() => router.push(caseHref(tab, theCase.pet_id, theCase.id) as never)}
        />
      </Card>
    )
  }

  const offer = current.offer
  const enabled = theCase ? theCase.status === 'active' : offer.default_enabled && offer.replaces === null
  const schedule = followupScheduleFor(check.urgency)
  const description =
    offer.plan === 'vet' || !schedule
      ? words.offerVet
      : words.offerWatch(schedule.slots[0]!.afterHours, schedule.slots.at(-1)!.afterHours)
  const firstDue = theCase?.next_due_at ?? offer.first_due_at

  function toggle(next: boolean) {
    // The switch moves at once and comes back if the server says no.
    setState({ ...current!, case: theCase ? { ...theCase, status: next ? 'active' : 'off' } : null })
    void save(next)
  }

  async function allow() {
    setAsking(false)
    if (permission === 'denied') {
      void Linking.openSettings()
      return
    }
    const answer = await askPermission().catch(() => 'denied' as const)
    setPermission(answer)
    if (answer === 'granted') changed()
  }

  return (
    <Card outlined style={styles.card}>
      <View style={styles.head}>
        <Text variant="h3" style={styles.title}>
          {words.offerTitle(check.pet_name ?? t.result.fallbackTitle)}
        </Text>
        <Switch
          value={enabled}
          onValueChange={toggle}
          disabled={saving}
          accessibilityLabel={words.toggleLabel}
          accessibilityRole="switch"
          accessibilityState={{ checked: enabled, disabled: saving }}
          trackColor={{ true: colour.accent, false: colour.line }}
          thumbColor={colour.surface}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        />
      </View>
      <Text tone="muted" style={styles.line}>
        {description}
      </Text>
      {offer.replaces && !enabled ? (
        <Text variant="label" tone="muted" style={styles.line}>
          {words.offerReplaces(check.pet_name ?? '', checkDay(t, offer.replaces.origin_checked_at))}
        </Text>
      ) : null}
      <Text variant="caption" tone="faint" style={styles.line}>
        {enabled ? words.offerFirst(askWhen(t, firstDue)) : words.offerOff}
      </Text>
      {failed ? (
        <Text variant="label" tone="danger" style={styles.line} accessibilityLiveRegion="polite">
          {words.offerFailed}
        </Text>
      ) : null}
      {enabled && permission === 'undetermined' ? (
        <View style={styles.permission}>
          <Text variant="label" tone="muted" style={styles.permissionText}>
            {words.offerAllow}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => setAsking(true)} style={styles.allow}>
            <Text variant="bodyStrong" tone="accent" maxFontSizeMultiplier={CONTROL_FONT_LIMIT}>
              {words.offerAllowAction}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {enabled && permission === 'denied' ? (
        <View style={styles.permission}>
          <Text variant="label" tone="muted" style={styles.permissionText}>
            {words.offerDenied}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()} style={styles.allow}>
            <Text variant="bodyStrong" tone="accent" maxFontSizeMultiplier={CONTROL_FONT_LIMIT}>
              {words.offerOpenSettings}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <Sheet visible={asking} onClose={() => setAsking(false)}>
        <Text variant="h2">{words.askTitle}</Text>
        <Text tone="muted" style={styles.sheetBody}>
          {words.askBody(check.pet_name ?? '')}
        </Text>
        <Button title={words.offerAllowAction} onPress={() => void allow()} />
        <Button title={t.reminders.notNow} kind="secondary" onPress={() => setAsking(false)} style={styles.second} />
      </Sheet>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { marginBottom: space.block, padding: 20 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.row, minHeight: TAP_TARGET },
  title: { flex: 1 },
  line: { marginTop: 6 },
  permission: { flexDirection: 'row', alignItems: 'center', gap: space.row, marginTop: space.row },
  permissionText: { flex: 1 },
  allow: { minHeight: TAP_TARGET, justifyContent: 'center' },
  sheetBody: { marginTop: 8, marginBottom: space.section },
  second: { marginTop: space.row },
})
