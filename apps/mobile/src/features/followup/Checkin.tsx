import { useEffect, useRef, useState } from 'react'
import { Image, Pressable, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams, useSegments } from 'expo-router'
import {
  FOLLOWUP_NOTE_MAX,
  FollowupSourceSchema,
  FollowupStateSchema,
  type FollowupCase,
  type FollowupSource,
  type FollowupCheckinResult,
  type FollowupState,
} from '@lapka/contracts'
import { ApiError, followupAsksVet } from '@lapka/shared'
import { withFreshSession } from '@/lib/api'
import { useCached } from '@/lib/query-cache'
import { queryKeys } from '@/lib/query-keys'
import { describeFailure } from '@/lib/errors'
import { newRequestKey } from '@/lib/request-key'
import { useText, type Dictionary } from '@/i18n'
import { urgencyText } from '@/features/checks/urgency'
import { Button, LinkButton } from '@/ui/Button'
import { Banner, Card, UrgencyBadge } from '@/ui/Card'
import { Field, type FieldHandle } from '@/ui/Field'
import { Icon } from '@/ui/Icon'
import { Screen } from '@/ui/Screen'
import { DetailSkeleton } from '@/ui/Skeleton'
import { CONTROL_FONT_LIMIT, Text } from '@/ui/Text'
import { TAP_TARGET, colour, radius, space } from '@/ui/theme'
import { useFollowupChanged } from './cache'
import { FollowupOutcome } from './FollowupOutcome'
import { caseHref, checkDay } from './followup-ui'
import { MOODS } from './moods'

/** Under this many letters the counter stays out of the way. */
const COUNT_FROM = 450

/**
 * «Как Мурка сейчас?» — one answer, an optional note, and then what the rule
 * says. Opened from a notification, a card or the timeline; works from a cold
 * start, since it loads the case itself.
 */
export function Checkin({ caseId }: { caseId: string }) {
  const t = useText()
  const tab = (useSegments() as string[])[1]
  const { state: preset, from } = useLocalSearchParams<{ state?: string; from?: string }>()
  const loaded = useCached(queryKeys.followup(caseId), () => withFreshSession((api) => api.getFollowup(caseId)))
  const theCase = loaded.data
  const [result, setResult] = useState<FollowupCheckinResult | null>(null)

  if (result && theCase) {
    return <FollowupOutcome theCase={theCase} result={result} tab={tab} />
  }

  if (!theCase) {
    const notFound = loaded.error instanceof ApiError && loaded.error.code === 'not_found'
    const error = loaded.error ? describeFailure(t, loaded.error, t.common.offline) : null
    return (
      <Screen title={t.followup.timelineTitle} onBack={() => router.back()} scroll>
        {notFound ? (
          <>
            <Text variant="h2" style={styles.gap}>
              {t.followup.notFound}
            </Text>
            <Button title={t.common.toPets} kind="secondary" onPress={() => router.dismissTo('/pets')} />
          </>
        ) : error ? (
          <>
            <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} />
            <Button title={t.common.retry} kind="secondary" onPress={() => void loaded.reload()} />
          </>
        ) : (
          <DetailSkeleton facts={3} />
        )}
      </Screen>
    )
  }

  if (theCase.status !== 'active') {
    return (
      <Screen title={t.followup.question(theCase.pet_name)} onBack={() => router.back()} scroll>
        <Card outlined>
          <Text variant="h3">{t.followup.closedTitle}</Text>
          <Text tone="muted" style={styles.small}>
            {t.followup.closedBody}
          </Text>
        </Card>
        <Button
          title={t.followup.toTimeline}
          kind="secondary"
          onPress={() => router.replace(caseHref(tab, theCase.pet_id, theCase.id) as never)}
        />
      </Screen>
    )
  }

  return (
    <CheckinForm
      t={t}
      theCase={theCase}
      preset={FollowupStateSchema.safeParse(preset).success ? (preset as FollowupState) : null}
      source={FollowupSourceSchema.safeParse(from).success ? (from as FollowupSource) : 'timeline'}
      onDone={setResult}
    />
  )
}

function CheckinForm({
  t,
  theCase,
  preset,
  source,
  onDone,
}: {
  t: Dictionary
  theCase: FollowupCase
  preset: FollowupState | null
  source: FollowupSource
  onDone: (result: FollowupCheckinResult) => void
}) {
  const words = t.followup
  const asksVet = followupAsksVet(theCase.next_slot)
  const [vetVisited, setVetVisited] = useState<boolean | null>(null)
  const [state, setState] = useState<FollowupState | null>(preset)
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  // Opened by a tap: the caret goes straight in. Reopened after a failed send, it does not.
  const [noteAsked, setNoteAsked] = useState(false)
  const noteField = useRef<FieldHandle | null>(null)
  useEffect(() => {
    if (noteAsked) noteField.current?.focus()
  }, [noteAsked])
  const [contextOpen, setContextOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changed = useFollowupChanged()
  // One key for this form: a retry after a lost answer is the same answer.
  const key = useRef(newRequestKey())

  const ready = state !== null && (!asksVet || vetVisited !== null)
  const level = urgencyText(t, theCase.current_urgency)

  async function send() {
    if (!ready || sending) return
    setSending(true)
    setError(null)
    try {
      const answer = await withFreshSession((api) =>
        api.sendFollowupCheckin(theCase.id, key.current, {
          state: state!,
          ...(asksVet ? { vet_visited: vetVisited! } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
          source,
        }),
      )
      changed()
      onDone(answer)
    } catch (cause) {
      setError(describeFailure(t, cause, words.sendFailed).text)
      setNoteOpen((open) => open || note.length > 0)
    } finally {
      setSending(false)
    }
  }

  return (
    <Screen
      title={words.question(theCase.pet_name)}
      onBack={() => router.back()}
      scroll
      dock={
        <View>
          {error ? <Banner text={error} tone="error" style={styles.dockError} /> : null}
          <Button title={words.submit} busy={sending} disabled={!ready} onPress={() => void send()} />
        </View>
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: contextOpen }}
        accessibilityLabel={contextOpen ? words.contextClose : words.contextOpen}
        onPress={() => setContextOpen((open) => !open)}
        style={styles.context}
      >
        <Text variant="label" tone="muted" style={styles.contextText}>
          {words.contextLine(checkDay(t, theCase.origin_checked_at))}
        </Text>
        <UrgencyBadge level={theCase.current_urgency} label={level.label} />
        <View style={{ transform: [{ rotate: contextOpen ? '180deg' : '0deg' }] }}>
          <Icon name="down" size={16} color={colour.accent} />
        </View>
      </Pressable>
      {contextOpen ? (
        <Text tone="muted" style={styles.symptoms}>
          {theCase.symptoms}
        </Text>
      ) : null}

      {asksVet ? (
        <View style={styles.block} accessibilityRole="radiogroup" accessibilityLabel={words.vetQuestion}>
          <Text variant="h3" style={styles.questionTitle}>
            {words.vetQuestion}
          </Text>
          <View style={styles.vetRow}>
            {([true, false] as const).map((value) => (
              <Choice
                key={String(value)}
                label={value ? words.vetYes : words.vetNo}
                selected={vetVisited === value}
                onPress={() => setVetVisited(value)}
                style={styles.vetChoice}
              />
            ))}
          </View>
          <Text variant="h3" style={styles.questionTitle}>
            {words.stateQuestion}
          </Text>
        </View>
      ) : null}

      <View accessibilityRole="radiogroup" accessibilityLabel={words.question(theCase.pet_name)}>
        {(['better', 'same', 'worse'] as const).map((value) => (
          <Choice
            key={value}
            label={words[value]}
            hint={words[`${value}Hint`]}
            image={MOODS[theCase.pet_species][value]}
            selected={state === value}
            onPress={() => setState(value)}
          />
        ))}
      </View>

      {noteOpen ? (
        <Field
          label={words.noteLabel}
          labelHidden
          value={note}
          onChangeText={(text) => setNote(text.slice(0, FOLLOWUP_NOTE_MAX))}
          placeholder={words.notePlaceholder}
          hint={note.length >= COUNT_FROM ? words.noteCount(note.length, FOLLOWUP_NOTE_MAX) : undefined}
          multiline
          style={styles.note}
          fieldRef={(field) => {
            noteField.current = field
          }}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${words.addNote}. ${words.noteLabel}`}
          onPress={() => {
            setNoteOpen(true)
            setNoteAsked(true)
          }}
          style={styles.addNote}
        >
          <Icon name="plus" size={18} color={colour.accent} />
          <Text variant="bodyStrong" tone="accent" maxFontSizeMultiplier={CONTROL_FONT_LIMIT}>
            {words.addNote}
          </Text>
        </Pressable>
      )}
    </Screen>
  )
}

/** One answer: the pet's face, the word and what it means; chosen is outlined, not only coloured. */
function Choice({
  label,
  hint,
  image,
  selected,
  onPress,
  style,
}: {
  label: string
  hint?: string
  image?: ReturnType<typeof require>
  selected: boolean
  onPress: () => void
  style?: object
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        selected ? styles.choiceSelected : null,
        { opacity: pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {image ? <Image source={image} style={styles.mood} accessible={false} resizeMode="contain" /> : null}
      <View style={styles.choiceText}>
        <Text variant="h3">{label}</Text>
        {hint ? (
          <Text variant="label" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  gap: { marginBottom: space.block },
  small: { marginTop: 4 },
  context: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: TAP_TARGET,
    marginBottom: space.row,
  },
  contextText: { flexShrink: 1 },
  symptoms: { marginBottom: space.block },
  block: { marginBottom: 4 },
  questionTitle: { marginBottom: space.row },
  vetRow: { flexDirection: 'row', gap: space.row, marginBottom: space.block },
  vetChoice: { flex: 1, justifyContent: 'center', marginBottom: 0 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: TAP_TARGET + 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: space.row,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colour.line,
    backgroundColor: colour.surface,
  },
  choiceSelected: { backgroundColor: colour.accentSoft, borderColor: colour.accent, borderWidth: 2 },
  mood: { width: 64, height: 64 },
  choiceText: { flex: 1, gap: 2 },
  addNote: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: TAP_TARGET, marginTop: 4 },
  note: { marginTop: space.row },
  dockError: { marginBottom: space.row },
})
