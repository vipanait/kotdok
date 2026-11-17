import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { DOCUMENT_KINDS, type DocumentKind, type PetDocument } from '@lapka/contracts'
import { useText } from '@/i18n'
import { Button } from '@/ui/Button'
import { Icon } from '@/ui/Icon'
import { CONTROL_FONT_LIMIT, Text } from '@/ui/Text'
import { CONTROL_HEIGHT, TAP_TARGET, colour, radius, space } from '@/ui/theme'
import type { DocumentFormat, DocumentRowView } from './document-view'
import { pageCaption, type DraftPage } from './page-list'

/**
 * The pieces the documents screens share (DOC-1). Built from the app's own
 * tokens and controls; nothing of the prototype's CSS.
 */

/** «PDF» or «ФОТО», small, beside a row's name. Read out by the row's label, not on its own. */
export function FormatMark({ format }: { format: DocumentFormat }) {
  const t = useText()
  return (
    <View style={styles.mark} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Text variant="caption" style={styles.markText} maxFontSizeMultiplier={CONTROL_FONT_LIMIT}>
        {t.documents.format[format]}
      </Text>
    </View>
  )
}

/** A status in words, never a colour alone. */
export function StatusTag({ text }: { text: string }) {
  return (
    <View style={styles.tag}>
      <Text variant="caption" tone="accent" style={styles.tagText}>
        {text}
      </Text>
    </View>
  )
}

/** One tappable line: a mark, a name that wraps, what is under it, a chevron. */
export function DocumentLine({
  format,
  title,
  meta,
  status,
  label,
  onPress,
}: {
  format: DocumentFormat
  title: string
  meta?: string | null
  status?: string | null
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.line, { opacity: pressed ? 0.7 : 1 }]}
    >
      <FormatMark format={format} />
      <View style={styles.lineCopy}>
        <Text variant="h3">{title}</Text>
        {meta ? (
          <Text variant="label" tone="muted">
            {meta}
          </Text>
        ) : null}
        {status ? <StatusTag text={status} /> : null}
      </View>
      <Icon name="chevron" size={20} color={colour.faint} />
    </Pressable>
  )
}

export function DocumentListRow({ row, onPress }: { row: DocumentRowView; onPress: () => void }) {
  return <DocumentLine format={row.format} title={row.title} meta={row.meta} status={row.status} label={row.label} onPress={onPress} />
}

const noticeTones = {
  success: { background: colour.accentSoft, icon: 'check', iconColour: colour.accentText },
  note: { background: colour.soft, icon: 'info', iconColour: colour.text },
  error: { background: colour.dangerSoft, icon: 'alert', iconColour: colour.danger },
} as const

/** A heading with a line under it: a saved document, a full list, a refused file. */
export function Notice({ title, body, tone = 'note' }: { title: string; body?: string | null; tone?: keyof typeof noticeTones }) {
  const look = noticeTones[tone]
  return (
    <View
      accessible
      accessibilityRole={tone === 'error' ? 'alert' : 'summary'}
      accessibilityLiveRegion={tone === 'note' ? 'none' : 'polite'}
      style={[styles.notice, { backgroundColor: look.background }]}
    >
      <Icon name={look.icon} size={20} color={look.iconColour} />
      <View style={styles.noticeCopy}>
        <Text variant="bodyStrong" tone={tone === 'error' ? 'danger' : 'default'}>
          {title}
        </Text>
        {body ? <Text>{body}</Text> : null}
      </View>
    </View>
  )
}

/** A quiet block in the page's flow: the empty list, a failed load, an archive kind. No card around the form. */
export function Quiet({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <View style={styles.quiet}>
      <Text variant="h2">{title}</Text>
      <Text tone="muted">{body}</Text>
      {children ? <View style={styles.quietActions}>{children}</View> : null}
    </View>
  )
}

/** «Что это за документ?»: one kind, chips that say which is chosen out loud. */
export function KindChoice({
  value,
  onChange,
  error,
}: {
  value: DocumentKind | null
  onChange: (kind: DocumentKind) => void
  error: string | null
}) {
  const t = useText()
  const words = t.documents
  return (
    <View style={styles.group}>
      <Text variant="label" tone="muted" style={styles.groupLabel}>
        {words.upload.kindLabel}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={words.upload.kindLabel} style={styles.chips}>
        {DOCUMENT_KINDS.map((kind) => {
          const chosen = kind === value
          return (
            <Pressable
              key={kind}
              accessibilityRole="radio"
              accessibilityState={{ checked: chosen }}
              accessibilityLabel={words.kinds[kind]}
              onPress={() => onChange(kind)}
              style={[styles.chip, chosen ? styles.chipChosen : null, error ? styles.chipError : null]}
            >
              <Text tone={chosen ? 'accent' : 'default'} maxFontSizeMultiplier={CONTROL_FONT_LIMIT}>
                {words.kinds[kind]}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {error ? (
        <Text variant="caption" tone="danger" style={styles.groupHint} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : value ? (
        <Text variant="caption" tone="muted" style={styles.groupHint}>
          {words.kindHints[value]}
        </Text>
      ) : null}
    </View>
  )
}

/**
 * The chosen pages, top to bottom in the order they will be sent: a number,
 * the file's name (or «Фото с камеры 2»), opened by a tap, and separate
 * actions to move or remove each, named with the page they act on.
 */
export function PageList({
  pages,
  onOpen,
  onMove,
  onRemove,
  disabled,
}: {
  pages: readonly DraftPage[]
  onOpen: (page: DraftPage) => void
  onMove: (index: number, delta: -1 | 1) => void
  onRemove: (index: number) => void
  disabled: boolean
}) {
  const t = useText()
  const words = t.documents.upload
  return (
    <View>
      {pages.map((page, index) => {
        const n = index + 1
        const caption = pageCaption(t, page)
        return (
          <View key={page.key} style={[styles.page, index > 0 ? styles.pageDivider : null]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={words.open(n, caption)}
              onPress={() => onOpen(page)}
              style={({ pressed }) => [styles.pageOpen, { opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={styles.pageNumber} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Text variant="bodyStrong" tone="accent" maxFontSizeMultiplier={CONTROL_FONT_LIMIT}>
                  {n}
                </Text>
              </View>
              <View style={styles.lineCopy}>
                <Text variant="bodyStrong">{words.pageN(n)}</Text>
                <Text variant="label" tone="muted">
                  {caption}
                </Text>
              </View>
              <Icon name="chevron" size={20} color={colour.faint} />
            </Pressable>
            <View style={styles.pageActions}>
              {index > 0 ? (
                <Button
                  compact
                  kind="secondary"
                  title={words.moveUp}
                  accessibilityLabel={words.moveUpLabel(n, caption)}
                  disabled={disabled}
                  onPress={() => onMove(index, -1)}
                />
              ) : null}
              {index < pages.length - 1 ? (
                <Button
                  compact
                  kind="secondary"
                  title={words.moveDown}
                  accessibilityLabel={words.moveDownLabel(n, caption)}
                  disabled={disabled}
                  onPress={() => onMove(index, 1)}
                />
              ) : null}
              <Button
                compact
                kind="outlineDanger"
                title={words.remove}
                accessibilityLabel={words.removeLabel(n, caption)}
                disabled={disabled}
                onPress={() => onRemove(index)}
              />
            </View>
          </View>
        )
      })}
    </View>
  )
}

/**
 * Where recognition will be offered on a stored passport or prescription
 * (DOC-2). Hidden for now (ruling R2): the contract has no flag that says
 * recognition is available, and a button that can only fail is worse than
 * none. The slot stays so the offer lands here and nowhere else: once the
 * API says so, it renders `recognition/RecognitionStates` `RecognitionOffer`
 * with the API's free uses, price and balance.
 */
export function RecognitionOffer(_props: { doc: PetDocument }) {
  return null
}

const styles = StyleSheet.create({
  mark: {
    minWidth: 44,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colour.soft,
    alignItems: 'center',
  },
  markText: { fontWeight: '700', letterSpacing: 0.4 },
  tag: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colour.accentSoft,
  },
  tagText: { fontWeight: '700' },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.row,
    minHeight: CONTROL_HEIGHT + 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colour.line,
    backgroundColor: colour.surface,
  },
  lineCopy: { flex: 1, minWidth: 0, gap: 2 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.field,
    marginBottom: space.block,
  },
  noticeCopy: { flex: 1, minWidth: 0, gap: 2 },
  quiet: { gap: space.row, marginBottom: space.block },
  quietActions: { gap: space.row, marginTop: 4 },
  group: { marginBottom: space.block },
  groupLabel: { marginBottom: 6 },
  groupHint: { marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: TAP_TARGET,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colour.line,
    borderRadius: radius.pill,
    backgroundColor: colour.surface,
  },
  chipChosen: { borderColor: colour.accent, backgroundColor: colour.accentSoft },
  chipError: { borderColor: colour.danger },
  page: { paddingVertical: 10 },
  pageDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colour.line },
  pageOpen: { flexDirection: 'row', alignItems: 'center', gap: space.row, minHeight: TAP_TARGET },
  pageNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colour.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, paddingLeft: 48 },
})
