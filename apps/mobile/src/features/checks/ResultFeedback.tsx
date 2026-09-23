import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import type { FeedbackRating } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { useText } from '@/i18n'
import { Button } from '@/ui/Button'
import { Field } from '@/ui/Field'
import { Icon } from '@/ui/Icon'
import { Text } from '@/ui/Text'
import { TAP_TARGET, colour, radius, space } from '@/ui/theme'

type Stage = 'loading' | 'ask' | 'comment' | 'done' | 'hidden'

/**
 * "Was this answer useful?" at the foot of a result (design 6.16).
 *
 * The rating is stored on the tap, so the answer survives someone putting the
 * phone away before writing a comment; the comment, if any, is sent with the
 * same rating and replaces it.
 */
export function ResultFeedback({ checkId }: { checkId: string }) {
  const ui = useText()
  const [stage, setStage] = useState<Stage>('loading')
  const [rating, setRating] = useState<FeedbackRating | null>(null)
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    withFreshSession((api) => api.getCheckFeedback(checkId))
      .then((feedback) => {
        if (!cancelled) setStage(feedback.rating ? 'done' : 'ask')
      })
      // Asking is optional; not knowing whether it was answered hides the
      // block rather than putting an error under someone's result.
      .catch(() => {
        if (!cancelled) setStage('hidden')
      })
    return () => {
      cancelled = true
    }
  }, [checkId])

  async function send(nextRating: FeedbackRating, nextComment?: string): Promise<boolean> {
    setSending(true)
    setFailed(false)
    try {
      await withFreshSession((api) =>
        api.sendFeedback({ check_id: checkId, rating: nextRating, comment: nextComment }),
      )
      return true
    } catch {
      setFailed(true)
      return false
    } finally {
      setSending(false)
    }
  }

  async function choose(nextRating: FeedbackRating) {
    setRating(nextRating)
    if (await send(nextRating)) setStage('comment')
  }

  async function submitComment() {
    const trimmed = comment.trim()
    if (!rating) return
    if (!trimmed || (await send(rating, trimmed))) setStage('done')
  }

  if (stage === 'loading' || stage === 'hidden') return null

  if (stage === 'done') {
    return (
      <View style={[styles.block, styles.doneRow]} accessible accessibilityLabel={ui.result.feedbackThanks}>
        <Icon name="check" color={colour.accentText} />
        <Text tone="accent">{ui.result.feedbackThanks}</Text>
      </View>
    )
  }

  return (
    <View style={styles.block}>
      <Text variant="h3">{ui.result.feedbackQuestion}</Text>
      <View style={styles.votes}>
        {(['liked', 'disliked'] as const).map((value) => {
          const selected = rating === value
          return (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={value === 'liked' ? ui.result.feedbackLiked : ui.result.feedbackDisliked}
              accessibilityState={{ selected, disabled: sending }}
              disabled={sending}
              onPress={() => void choose(value)}
              style={({ pressed }) => [
                styles.vote,
                selected ? styles.voteSelected : null,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Icon
                name={value === 'liked' ? 'thumb' : 'thumbdown'}
                color={selected ? colour.accentText : colour.text}
              />
            </Pressable>
          )
        })}
      </View>

      {stage === 'comment' ? (
        <>
          <Field
            label={ui.result.feedbackComment}
            labelHidden
            placeholder={ui.result.feedbackComment}
            value={comment}
            onChangeText={setComment}
            multiline
          />
          <Button title={ui.result.feedbackSend} busy={sending} onPress={() => void submitComment()} />
        </>
      ) : null}

      {failed ? (
        <Text variant="caption" tone="danger">
          {ui.result.feedbackFailed}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colour.soft,
    borderRadius: radius.card,
    padding: 16,
    gap: space.row,
    // The banners above it keep the same distance from what follows.
    marginBottom: space.block,
  },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  votes: { flexDirection: 'row', gap: 8 },
  vote: {
    minWidth: TAP_TARGET,
    minHeight: TAP_TARGET,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colour.surface,
    borderWidth: 1,
    borderColor: colour.line,
  },
  voteSelected: { backgroundColor: colour.accentSoft, borderColor: colour.accent },
})
