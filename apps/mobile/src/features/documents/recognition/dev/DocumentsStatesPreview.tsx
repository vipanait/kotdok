import { useState, type ReactNode } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { savedSummary, type RecognitionDraft } from '@lapka/shared'
import { useText } from '@/i18n'
import { Button } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { Screen } from '@/ui/Screen'
import { CONTROL_FONT_LIMIT, Text } from '@/ui/Text'
import { TAP_TARGET, colour, radius, space } from '@/ui/theme'
import { documentRoute, originalBackTitle } from '../../document-view'
import { DocumentLine, Notice } from '../../parts'
import { ConfirmedSummary } from '../ConfirmedSummary'
import { FailedState, NothingFoundState, RecognitionOffer, RecognitionProgress } from '../RecognitionStates'
import { ReviewScreen } from '../ReviewScreen'
import { SourceLine } from '../SourceLine'
import {
  FIXTURE_MISMATCH_DRAFT,
  FIXTURE_PASSPORT,
  FIXTURE_PASSPORT_DRAFT,
  FIXTURE_PET,
  FIXTURE_PRESCRIPTION,
  FIXTURE_PRICES,
  FIXTURE_RECIPE_DRAFT,
  FIXTURE_SAVED_PASSPORT,
  FIXTURE_SAVED_RECIPE,
  FIXTURE_TODAY,
  PREVIEW_STATES,
  STATE_TITLES,
  type PreviewState,
} from './fixtures'

/**
 * The recognition states on fixtures (ruling R1), for a developer to look at
 * on a phone before DOC-2 exists: every state of the design map that the
 * server cannot produce yet, drawn by the real components with fixed test
 * data. Reached only from the `__DEV__`-gated route
 * `pets/[id]/documents/dev-states`; a release bundle does not contain this
 * file. TEST DATA — nothing here is a recognition result, and nothing is
 * sent: the callbacks only move between states. The words of this screen's
 * own bar are a developer's, in Russian, and stay out of the dictionaries.
 */
export function DocumentsStatesPreview({ petId, state: opened }: { petId: string; state?: string }) {
  const t = useText()
  const [state, setState] = useState<PreviewState>(() =>
    PREVIEW_STATES.includes(opened as PreviewState) ? (opened as PreviewState) : 'stored',
  )
  const [original, setOriginal] = useState<{ page: number; from: string } | null>(null)
  const [stub, setStub] = useState<string | null>(null)

  const bar = <DevBar state={state} onChange={setState} />
  const openOriginal = (page: number, from: string) => setOriginal({ page, from })
  const standIns = (
    <>
      <StandIn
        visible={original !== null}
        title={original ? `Оригинал · страница ${original.page} (заглушка)` : ''}
        body="В приложении здесь страница документа. Вернитесь: выбор, исправления и место в списке должны остаться."
        back={originalBackTitle(t, original?.from)}
        onBack={() => setOriginal(null)}
      />
      <StandIn
        visible={stub !== null}
        title={stub ?? ''}
        body="Экран приложения вне этого просмотра (заглушка)."
        back={t.common.back}
        onBack={() => setStub(null)}
      />
    </>
  )

  const review = (draft: RecognitionDraft, doc: typeof FIXTURE_PASSPORT, initial?: { edit?: string; discard?: boolean }) => (
    <>
      <ReviewScreen
        key={state}
        petName={FIXTURE_PET.name}
        species={FIXTURE_PET.species}
        today={FIXTURE_TODAY}
        document={{ id: doc.id, title: doc.title, format: 'photo' }}
        draft={draft}
        onBack={() => router.back()}
        onOpenPage={openOriginal}
        onOpenRecord={() => setStub('Запись медкарты')}
        // Nothing is sent: a pause, then the success state.
        onConfirm={() => new Promise((resolve) => setTimeout(resolve, 600))}
        onSaved={() => setState(draft === FIXTURE_RECIPE_DRAFT ? 'confirmed-recipe' : 'confirmed')}
        onDiscard={() => new Promise((resolve) => setTimeout(resolve, 400))}
        onDiscarded={() => setState('stored')}
        initial={initial}
        top={bar}
      />
      {standIns}
    </>
  )

  switch (state) {
    case 'review':
      return review(FIXTURE_PASSPORT_DRAFT, FIXTURE_PASSPORT)
    case 'edit':
      return review(FIXTURE_PASSPORT_DRAFT, FIXTURE_PASSPORT, { edit: 'v3' })
    case 'mismatch':
      return review(FIXTURE_MISMATCH_DRAFT, FIXTURE_PASSPORT)
    case 'recipe':
      return review(FIXTURE_RECIPE_DRAFT, FIXTURE_PRESCRIPTION)
    case 'discard':
      return review(FIXTURE_PASSPORT_DRAFT, FIXTURE_PASSPORT, { discard: true })
    default:
      break
  }

  const doc = state === 'confirmed-recipe' ? FIXTURE_PRESCRIPTION : FIXTURE_PASSPORT
  const words = t.documents
  let title = doc.title
  let subtitle: string | null = `${words.kinds.vet_passport} · ${words.pages(doc.pages)}`
  let body: ReactNode = null
  const originalRow = (
    <DocumentLine
      format="photo"
      title={words.view.openOriginal}
      meta={`${words.pages(doc.pages)} · ${words.view.photos}`}
      label={words.view.openOriginal}
      onPress={() => openOriginal(1, 'document')}
    />
  )

  switch (state) {
    case 'stored':
    case 'paid':
    case 'credits': {
      const prices = FIXTURE_PRICES[state]
      body = (
        <>
          {originalRow}
          <RecognitionOffer
            kind="vet_passport"
            left={prices.left}
            price={prices.price}
            credits={prices.credits}
            onRecognize={() => setState('recognizing')}
            onTopUp={() => setStub('Пополнение баланса')}
          />
        </>
      )
      break
    }
    case 'recognizing':
      body = <RecognitionProgress title={doc.title} onToList={() => router.push(documentRoute.list(petId))} />
      break
    case 'failed':
      body = <FailedState onRetry={() => setState('recognizing')} onOpenOriginal={() => openOriginal(1, 'document')} />
      break
    case 'nothing':
      body = <NothingFoundState onAddPages={() => setState('stored')} onOpenOriginal={() => openOriginal(1, 'document')} />
      break
    case 'confirmed':
    case 'confirmed-recipe':
      title = words.recognition.confirmed.title
      subtitle = null
      body = (
        <ConfirmedSummary
          groups={savedSummary(state === 'confirmed' ? FIXTURE_SAVED_PASSPORT : FIXTURE_SAVED_RECIPE)}
          source={{ title: doc.title }}
          onOpenSource={() => setState('stored')}
          onDone={() => setStub('Медкарта')}
        />
      )
      break
    case 'vaccination':
      title = t.medicalRecord.vaccinationTitle
      subtitle = null
      body = (
        <>
          <Card outlined style={styles.record}>
            <Text variant="h2">{t.day('2026-03-12', true)}</Text>
            <Text tone="muted">Тестовая клиника</Text>
          </Card>
          <Card outlined style={styles.record}>
            <Text variant="bodyStrong">Тестовая вакцина Трио</Text>
            <Text tone="muted">Панлейкопения, калицивироз, ринотрахеит</Text>
          </Card>
          <SourceLine title={FIXTURE_PASSPORT.title} onPress={() => setState('stored')} />
        </>
      )
      break
  }

  return (
    <Screen title={title} subtitle={subtitle} backLabel={words.backToList} onBack={() => router.back()} scroll>
      {bar}
      {body}
      {standIns}
    </Screen>
  )
}

/** «Тестовые данные» and the states to switch between, on top of every state. */
function DevBar({ state, onChange }: { state: PreviewState; onChange: (state: PreviewState) => void }) {
  return (
    <View style={styles.bar}>
      <Notice tone="error" title="Тестовые данные" body="Экран разработчика (только __DEV__). Это не результат распознавания, ничего не отправляется." />
      <View accessibilityRole="radiogroup" accessibilityLabel="Состояние" style={styles.chips}>
        {PREVIEW_STATES.map((key) => {
          const chosen = key === state
          return (
            <Pressable
              key={key}
              accessibilityRole="radio"
              accessibilityState={{ checked: chosen }}
              accessibilityLabel={STATE_TITLES[key]}
              onPress={() => onChange(key)}
              style={[styles.chip, chosen ? styles.chipChosen : null]}
            >
              <Text variant="label" tone={chosen ? 'accent' : 'default'} maxFontSizeMultiplier={CONTROL_FONT_LIMIT}>
                {STATE_TITLES[key]}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

/** A screen the preview cannot really open — a page of the original, a record — said as such, with the way back. */
function StandIn({ visible, title, body, back, onBack }: { visible: boolean; title: string; body: string; back: string; onBack: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onBack}>
      <SafeAreaView style={styles.standIn}>
        <Text variant="h2">{title}</Text>
        <Text tone="muted">{body}</Text>
        <View style={styles.page} />
        <Button title={back} kind="secondary" onPress={onBack} />
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  bar: { marginBottom: space.block },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: TAP_TARGET,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colour.line,
    borderRadius: radius.pill,
    backgroundColor: colour.surface,
  },
  chipChosen: { borderColor: colour.accent, backgroundColor: colour.accentSoft },
  record: { padding: 16, gap: 4, marginBottom: space.row },
  standIn: { flex: 1, backgroundColor: colour.canvas, padding: space.gutter, gap: space.row },
  page: { flex: 1, borderRadius: radius.card, borderWidth: 1, borderColor: colour.line, backgroundColor: colour.soft },
})
