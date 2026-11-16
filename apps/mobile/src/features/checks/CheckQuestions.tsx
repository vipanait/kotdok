import { useRef, useState } from 'react'
import { Linking, Pressable, StyleSheet, View } from 'react-native'
import { router, useSegments } from 'expo-router'
import { CHECK_QUESTION_MAX, CHECK_QUESTION_MIN, type SymptomCheckRecord } from '@lapka/contracts'
import { ApiError } from '@lapka/shared'
import { withFreshSession } from '@/lib/api'
import { useCached, useSeedCache } from '@/lib/query-cache'
import { queryKeys } from '@/lib/query-keys'
import { dictionary } from '@/i18n'
import { localDay } from '@/features/followup/followup-ui'
import { askRecheck } from '@/features/followup/recheck-request'
import { clinicSearchUrl } from '@/features/checks/check-answers'
import { Button } from '@/ui/Button'
import { Field } from '@/ui/Field'
import { Icon } from '@/ui/Icon'
import { Text } from '@/ui/Text'
import { TAP_TARGET, colour, radius, space, urgency as urgencyScale } from '@/ui/theme'
import { alertText, canSend, clearedAfterAnswer, conflictNotice, isOpen, showsBlock, suggestionsFor, threadNote } from './check-questions'

/** A fresh key for a question; the platform's crypto where there is one. */
function newKey(): string {
  const crypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  return crypto?.randomUUID?.() ?? `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/**
 * «Уточнить по этой проверке» under a result (CQ-03): up to three questions
 * about this check, within 48 hours of it, answered in place.
 *
 * The thread is read on its own; if it cannot be, the block is left out and
 * the result stands as it was. A question keeps its Idempotency-Key until it
 * is answered or its words change, so a retry after a lost answer never spends
 * a second of the three.
 */
export function CheckQuestions({ check }: { check: SymptomCheckRecord }) {
  // The result speaks the language it was written in; so does this block.
  const words = dictionary(check.locale).checkQuestions
  const tab = (useSegments() as string[])[1]
  const seed = useSeedCache()
  const loaded = useCached(queryKeys.checkQuestions(check.id), () =>
    withFreshSession((api) => api.getCheckQuestions(check.id)),
  )
  const [text, setText] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sent = useRef<{ question: string; key: string } | null>(null)

  const thread = loaded.data
  const now = new Date()
  if (!thread || !showsBlock(thread, now)) return null
  const open = isOpen(thread, now)
  const sendable = canSend(thread, now, text, pending)

  async function ask(question: string) {
    if (pending !== null) return
    if (Array.from(question).length < CHECK_QUESTION_MIN) {
      setError(words.tooShort)
      return
    }
    if (sent.current?.question !== question) sent.current = { question, key: newKey() }
    const key = sent.current.key

    setPending(question)
    setError(null)
    try {
      const result = await withFreshSession((api) =>
        api.askCheckQuestion(check.id, key, { question }, localDay(new Date())),
      )
      seed([[queryKeys.checkQuestions(check.id), result.thread]])
      setText((current) => clearedAfterAnswer(current, question))
      sent.current = null
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'rate_limited') {
        setError(words.tooOften)
      } else if (failure instanceof ApiError && failure.code === 'conflict') {
        // No places left, the window closed, or this very question is still
        // being answered: the thread itself says which.
        const fresh = await withFreshSession((api) => api.getCheckQuestions(check.id)).catch(() => null)
        if (fresh) seed([[queryKeys.checkQuestions(check.id), fresh]])
        setError(conflictNotice(fresh, new Date(), words))
      } else {
        setError(words.failed)
      }
    } finally {
      setPending(null)
    }
  }

  function recheck() {
    const theCase = check.followup
    if (theCase && theCase.status === 'active' && check.pet_id) {
      askRecheck({ caseId: theCase.case_id, petId: check.pet_id })
    }
    // With this pet chosen, as the history's «Проверить» does. In the check tab
    // the form is under this result: back down to it, as «Новая проверка» does.
    const target = check.pet_id ? { pathname: '/check' as const, params: { petId: check.pet_id } } : '/check'
    if (tab === 'check') router.dismissTo(target)
    else router.navigate(target)
  }

  const suggestions = thread.items.length === 0 && pending === null ? suggestionsFor(check.urgency, words) : []

  return (
    <View style={styles.block}>
      <Text variant="h3">{words.title}</Text>
      <Text variant="label" tone="muted" style={styles.note}>
        {threadNote(thread, now, words, check.locale)}
      </Text>

      {thread.items.map((item) => {
        const plate = alertText(item.alert, check.pet_name, words)
        const tone = urgencyScale[item.alert === 'clinic_now' ? 'emergency' : 'urgent']
        return (
          <View key={item.id} style={styles.pair}>
            <View style={styles.question}>
              <Text variant="caption" tone="muted">{words.youAsked}</Text>
              <Text variant="bodyStrong">{item.question}</Text>
            </View>
            <Text variant="label" tone="accent" style={styles.who}>
              {words.lapka}
            </Text>
            <Text style={styles.answer}>{item.answer}</Text>
            {plate ? (
              <View style={[styles.plate, { backgroundColor: tone.background }]} accessible accessibilityRole="alert">
                <View style={styles.plateHead}>
                  <Icon name="alert" color={tone.signal} />
                  <Text variant="bodyStrong" style={[styles.plateText, { color: tone.signal }]}>
                    {plate}
                  </Text>
                </View>
                <Button title={words.findClinic} onPress={() => void Linking.openURL(clinicSearchUrl(words.clinicSearchQuery))} />
                <Button title={words.recheck} kind="secondary" onPress={recheck} />
              </View>
            ) : null}
          </View>
        )
      })}

      {pending !== null ? (
        <View style={styles.pair} accessibilityState={{ busy: true }}>
          <View style={styles.question}>
            <Text variant="caption" tone="muted">{words.youAsked}</Text>
            <Text variant="bodyStrong">{pending}</Text>
          </View>
          <Text variant="label" tone="muted" style={styles.who}>
            {words.answering}
          </Text>
        </View>
      ) : null}

      {open ? (
        <>
          {suggestions.length > 0 ? (
            <View style={styles.suggestions}>
              {suggestions.map((suggestion) => (
                <Pressable
                  key={suggestion}
                  accessibilityRole="button"
                  accessibilityState={{ selected: text === suggestion }}
                  onPress={() => setText(suggestion)}
                  style={({ pressed }) => [styles.suggestion, text === suggestion ? styles.suggestionSelected : null, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Text variant="label" tone={text === suggestion ? 'accent' : 'default'}>{suggestion}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Field
            label={words.fieldLabel}
            labelHidden
            placeholder={words.placeholder}
            value={text}
            onChangeText={(next) => setText(next.slice(0, CHECK_QUESTION_MAX))}
            multiline
            style={styles.field}
            // Inside the field, so it rides above the keyboard with it: the
            // button under the field is hidden while typing.
            action={{ icon: 'send', label: words.ask, onPress: () => void ask(text.trim()), disabled: !sendable }}
          />
          <Button
            title={words.ask}
            busy={pending !== null}
            disabled={!sendable && pending === null}
            onPress={() => void ask(text.trim())}
          />
        </>
      ) : null}

      {error ? (
        <Text variant="label" tone="danger" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {/* Set apart from the button by its own rule, never touching it. */}
      <View style={styles.footnoteRule} />
      <Text variant="caption" tone="faint" style={styles.footnote}>
        {words.note}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  block: {
    marginBottom: space.block,
    marginTop: space.row,
    paddingTop: space.block,
    borderTopWidth: 1,
    borderTopColor: colour.line,
    gap: 4,
  },
  note: { marginTop: 4, marginBottom: 8 },
  pair: { marginTop: space.block, gap: 6 },
  question: { padding: 14, borderRadius: radius.field, backgroundColor: colour.soft, gap: 4 },
  who: { marginTop: 8 },
  answer: { lineHeight: 24 },
  plate: { marginTop: 10, padding: 14, borderRadius: radius.field, gap: 10 },
  plateHead: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  plateText: { flex: 1 },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 12 },
  suggestion: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: TAP_TARGET,
    justifyContent: 'center',
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colour.line,
    backgroundColor: colour.surface,
    maxWidth: '100%',
  },
  suggestionSelected: { borderColor: colour.accent, backgroundColor: colour.accentSoft },
  field: { marginTop: 12, marginBottom: 12 },
  error: { marginTop: 8 },
  footnoteRule: { marginTop: space.block, height: 1, backgroundColor: colour.line },
  footnote: { marginTop: space.row },
})
