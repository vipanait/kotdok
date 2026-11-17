import { useEffect, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native'
import { checksCount, recognizeLabel } from '@lapka/shared'
import { useLocale, useText } from '@/i18n'
import { Button, LinkButton } from '@/ui/Button'
import { Text } from '@/ui/Text'
import { colour, radius, space } from '@/ui/theme'

/**
 * The small states of recognition (DOC-2): the offer on a stored passport or
 * prescription — free or paid —, a balance too short, the wait, a failure
 * and nothing found. Every number — free uses left, the price, the balance —
 * comes in as a prop from the API; none is written here. Each block sits in
 * the page's flow, not in a card. The site's `RecognitionStates.tsx`, in the
 * app's controls.
 */

/** A block of the page: a heading, a line, then what to do. */
function Block({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <View style={styles.block}>
      <Text variant="h2" accessibilityRole="header">
        {title}
      </Text>
      <Text tone="muted">{body}</Text>
      {children}
    </View>
  )
}

/**
 * Says a state out loud when it appears, on iOS and Android alike: a live
 * region is Android's only, and a screen that turns into «Не удалось
 * распознать» must not do it in silence.
 */
function useAnnounce(text: string) {
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(text)
  }, [text])
}

/**
 * Two actions of a state, in one block: the main one first, one under the
 * other, the same width, 12 apart (design run: failed, nothing).
 */
export function StateActions({ children }: { children: ReactNode }) {
  return <View style={styles.actions}>{children}</View>
}

/**
 * «Добавим записи в медкарту?» with «Распознать — бесплатно, осталось N» or
 * «Распознать — 1 проверка» and what happens if it fails. With neither a
 * free use nor the credits, the top-up state instead. Not on the real
 * stored-document screen until the API says recognition is available (R2).
 */
export function RecognitionOffer({
  kind,
  left,
  price,
  credits,
  busy = false,
  onRecognize,
  onTopUp,
}: {
  kind: 'vet_passport' | 'prescription'
  /** `free_recognitions_left` of `GET /documents`. */
  left: number
  /** `recognition_price` of `GET /documents`. */
  price: number
  /** The account's balance. */
  credits: number
  busy?: boolean
  onRecognize: () => void
  onTopUp: () => void
}) {
  const t = useText()
  const locale = useLocale()
  const words = t.documents.recognition.offer
  const label = recognizeLabel(left, price, credits, locale)
  if (label.offer.kind === 'short') return <NoCreditsState price={label.offer.price} credits={credits} onTopUp={onTopUp} />
  return (
    <Block title={words.title} body={words.body[kind]}>
      <Button title={busy ? words.starting : label.text} busy={busy} onPress={onRecognize} />
      <Text variant="caption" tone="muted">
        {label.offer.kind === 'paid' ? words.paidNote(checksCount(credits, locale)) : words.freeNote}
      </Text>
    </Block>
  )
}

/** «Нужна 1 проверка»: no free recognitions left and the balance is short. The file is there anyway. */
export function NoCreditsState({ price, credits, onTopUp }: { price: number; credits: number; onTopUp: () => void }) {
  const t = useText()
  const locale = useLocale()
  const words = t.documents.recognition.credits
  return (
    <Block title={words.title(checksCount(price, locale))} body={words.body(checksCount(credits, locale))}>
      <Button title={words.topUp} onPress={onTopUp} />
    </Block>
  )
}

/**
 * The wait: an indeterminate bar — the time is not known, so no percentage —
 * and where the result will wait if the owner leaves.
 */
export function RecognitionProgress({ title, onToList }: { title: string; onToList: () => void }) {
  const t = useText()
  const words = t.documents.recognition.progress
  const where = words.where(title)
  const [slide] = useState(() => new Animated.Value(0))
  /** The track's own width, so the bar crosses it on any screen. */
  const [track, setTrack] = useState(0)
  useAnnounce(`${words.heading}. ${where}`)

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null
    let cancelled = false
    // A moving bar only when motion is welcome; still, it says the same in words.
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return
      loop = Animated.loop(Animated.timing(slide, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }))
      loop.start()
    })
    return () => {
      cancelled = true
      loop?.stop()
    }
  }, [slide])

  return (
    <Block title={words.heading} body={words.body}>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={words.label}
        accessibilityState={{ busy: true }}
        style={styles.track}
        onLayout={(event) => setTrack(event.nativeEvent.layout.width)}
      >
        <Animated.View
          style={[
            styles.bar,
            { transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [-BAR, Math.max(track, BAR)] }) }] },
          ]}
        />
      </View>
      <Text>{where}</Text>
      <LinkButton title={words.toList} align="left" onPress={onToList} />
    </Block>
  )
}

/** Recognition failed: «Попробовать снова» and «Открыть оригинал». Nothing was spent. */
export function FailedState({ onRetry, onOpenOriginal, busy = false }: { onRetry: () => void; onOpenOriginal: () => void; busy?: boolean }) {
  const t = useText()
  const words = t.documents.recognition.failed
  useAnnounce(`${words.title}. ${words.body}`)
  return (
    <Block title={words.title} body={words.body}>
      <StateActions>
        <Button title={words.retry} busy={busy} onPress={onRetry} />
        <Button title={words.original} kind="secondary" onPress={onOpenOriginal} />
      </StateActions>
    </Block>
  )
}

/** Nothing found: «Добавить другие страницы» and «Открыть оригинал». Nothing was spent. */
export function NothingFoundState({ onAddPages, onOpenOriginal }: { onAddPages: () => void; onOpenOriginal: () => void }) {
  const t = useText()
  const words = t.documents.recognition.nothing
  useAnnounce(`${words.title}. ${words.body}`)
  return (
    <Block title={words.title} body={words.body}>
      <StateActions>
        <Button title={words.addPages} onPress={onAddPages} />
        <Button title={words.original} kind="secondary" onPress={onOpenOriginal} />
      </StateActions>
    </Block>
  )
}

/** The moving bar's width. */
const BAR = 120

const styles = StyleSheet.create({
  block: { gap: space.row, marginBottom: space.block },
  actions: { gap: space.row, marginTop: 4 },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colour.soft,
    overflow: 'hidden',
    marginVertical: 4,
  },
  bar: { width: BAR, height: 8, borderRadius: radius.pill, backgroundColor: colour.accent },
})
