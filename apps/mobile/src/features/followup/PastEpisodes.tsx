import { StyleSheet, View } from 'react-native'
import { router, useSegments } from 'expo-router'
import type { PastEpisode } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { useCached } from '@/lib/query-cache'
import { queryKeys } from '@/lib/query-keys'
import { useText, type Dictionary } from '@/i18n'
import { urgencyText } from '@/features/checks/urgency'
import { LinkButton } from '@/ui/Button'
import { Card, UrgencyBadge } from '@/ui/Card'
import { Text } from '@/ui/Text'
import { space } from '@/ui/theme'
import { caseHref, localDay } from './followup-ui'

/** On the card: the three latest, then «Все случаи · N». */
const ON_CARD = 3
/** The vet summary covers the last six months. */
const SUMMARY_DAYS = 183

export function usePastEpisodes(petId: string) {
  return useCached(queryKeys.episodes(petId), () => withFreshSession((api) => api.listPastEpisodes(petId)))
}

/** «Рвота · 23–25 октября · Стало лучше». */
export function episodeLine(t: Dictionary, episode: PastEpisode): string {
  const from = t.day(localDay(new Date(episode.started_at)), false)
  const to = t.day(localDay(new Date(episode.closed_at)), false)
  const symptoms = episode.symptoms.replace(/[.\s]+$/, '')
  return [symptoms, t.followup.episodeLine(from, to), t.followup.status[episode.outcome]].filter(Boolean).join(' · ')
}

/** The episodes a vet summary lists: closed in the last six months. */
export function summaryEpisodes(items: readonly PastEpisode[], now: Date = new Date()): PastEpisode[] {
  const since = now.getTime() - SUMMARY_DAYS * 86_400_000
  return items.filter((episode) => new Date(episode.closed_at).getTime() >= since)
}

function EpisodeRow({ petId, episode }: { petId: string; episode: PastEpisode }) {
  const t = useText()
  const tab = (useSegments() as string[])[1]
  return (
    <Card outlined onPress={() => router.push(caseHref(tab, petId, episode.case_id) as never)} accessibilityLabel={episodeLine(t, episode)} style={styles.row}>
      <UrgencyBadge level={episode.origin_urgency} label={urgencyText(t, episode.origin_urgency).label} />
      <Text style={styles.rowText}>{episodeLine(t, episode)}</Text>
    </Card>
  )
}

/** «Перенесённые случаи» on the pet card; nothing when there are none. */
export function PastEpisodes({ petId }: { petId: string }) {
  const t = useText()
  const loaded = usePastEpisodes(petId)
  const items = loaded.data?.items ?? []
  if (items.length === 0) return null
  return (
    <View style={styles.block}>
      <Text variant="h2" style={styles.title}>
        {t.followup.episodesTitle}
      </Text>
      {items.slice(0, ON_CARD).map((episode) => (
        <EpisodeRow key={episode.case_id} petId={petId} episode={episode} />
      ))}
      {items.length > ON_CARD ? (
        <LinkButton title={t.followup.episodesAll(items.length)} align="left" onPress={() => router.push(`/pets/${petId}/episodes`)} />
      ) : null}
    </View>
  )
}

/** Every episode of a pet, newest first. */
export function AllPastEpisodes({ petId }: { petId: string }) {
  const loaded = usePastEpisodes(petId)
  return (
    <View>
      {(loaded.data?.items ?? []).map((episode) => (
        <EpisodeRow key={episode.case_id} petId={petId} episode={episode} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  block: { marginBottom: space.block },
  title: { marginBottom: space.row },
  row: { gap: 8 },
  rowText: { flexShrink: 1 },
})
