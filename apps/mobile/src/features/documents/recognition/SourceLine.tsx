import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { withFreshSession } from '@/lib/api'
import { useCached } from '@/lib/query-cache'
import { queryKeys } from '@/lib/query-keys'
import { useText } from '@/i18n'
import { Icon } from '@/ui/Icon'
import { Text } from '@/ui/Text'
import { CONTROL_HEIGHT, colour, radius, space } from '@/ui/theme'
import { documentRoute, documentTitle } from '../document-view'

/**
 * «Из документа: Ветпаспорт» under a record confirmed from a document — its
 * name and a way to it, no preview. No page: the contract has no
 * `source_page`.
 */
export function SourceLine({ title, onPress }: { title: string; onPress: () => void }) {
  const t = useText()
  const words = t.documents.source
  return (
    <View style={styles.block}>
      <Text variant="label" tone="muted">
        {words.label}
      </Text>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${words.line(title)}, ${words.open}`}
        onPress={onPress}
        style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Icon name="document" size={20} color={colour.accentText} />
        <View style={styles.copy}>
          <Text variant="bodyStrong">{title}</Text>
          <Text variant="label" tone="muted">
            {words.open}
          </Text>
        </View>
        <Icon name="chevron" size={20} color={colour.faint} />
      </Pressable>
    </View>
  )
}

/**
 * The source line of a record, read by `source_document_id` through the
 * document read (`GET /pets/{id}/documents/{docId}`): nothing at all while it
 * loads, when the document is gone (deleted — the record stays) or the read
 * fails; the record never waits for it. A tap opens the document.
 */
export function SourceDocumentLine({ petId, docId }: { petId: string; docId: string }) {
  const t = useText()
  const read = useCached(queryKeys.document(petId, docId), () => withFreshSession((api) => api.getDocument(petId, docId)))
  const doc = read.data?.id === docId ? read.data : null
  if (!doc) return null
  return <SourceLine title={documentTitle(t, doc)} onPress={() => router.push(documentRoute.view(petId, docId))} />
}

const styles = StyleSheet.create({
  block: { gap: 6, marginVertical: space.row },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.row,
    minHeight: CONTROL_HEIGHT,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colour.line,
    backgroundColor: colour.surface,
  },
  copy: { flex: 1, minWidth: 0, gap: 2 },
})
