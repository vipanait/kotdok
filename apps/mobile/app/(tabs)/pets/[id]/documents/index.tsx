import { StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { withFreshSession } from '@/lib/api'
import { localToday } from '@/lib/calendar-day'
import { describeFailure } from '@/lib/errors'
import { useCached } from '@/lib/query-cache'
import { queryKeys } from '@/lib/query-keys'
import { useText } from '@/i18n'
import { documentRoute, documentRow, listFull, listSubtitle } from '@/features/documents/document-view'
import { DocumentListRow, Notice, Quiet } from '@/features/documents/parts'
import { Button } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Screen } from '@/ui/Screen'
import { ListSkeleton } from '@/ui/Skeleton'
import { Text } from '@/ui/Text'
import { space } from '@/ui/theme'

/**
 * The pet's documents (DOC-1): compact rows — name, kind, date, pages, a
 * status in words — with no page previews. `← Медкарта` above the title, the
 * pet's name once under it. States: loading, a failed load with «Повторить»,
 * empty, and full at the per-pet limit.
 */
export default function Documents() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useText()
  const words = t.documents
  const today = localToday()

  // The pet's name from the record every screen of this pet shares.
  const record = useCached(queryKeys.overview(id), () => withFreshSession((api) => api.getHealthOverview(id, today)))
  const petName = record.data?.pet.id === id ? record.data.pet.name : null

  const list = useCached(queryKeys.documents(id), () => withFreshSession((api) => api.listDocuments(id)))
  const documents = list.data?.documents ?? null
  const error = list.error ? describeFailure(t, list.error, words.failed.title) : null
  const full = documents !== null && listFull(documents.length)
  const add = () => router.push(documentRoute.add(id))

  return (
    <Screen
      title={words.title}
      onBack={() => router.back()}
      backLabel={words.backToRecord}
      subtitle={listSubtitle(t, petName, documents?.length ?? null)}
      scroll
      dock={documents && documents.length > 0 && !full ? <Button title={words.add} onPress={add} /> : null}
    >
      {documents === null && !error ? (
        <View>
          <Text tone="muted" style={styles.loading} accessibilityLiveRegion="polite">
            {words.loading}
          </Text>
          <ListSkeleton rows={3} />
        </View>
      ) : null}

      {documents === null && error ? (
        <Quiet title={words.failed.title} body={error.offline ? words.failed.body : error.text}>
          <Button title={t.common.retry} kind="secondary" busy={list.fetching} onPress={() => void list.reload()} />
        </Quiet>
      ) : null}

      {/* Old documents and a failed refresh: the list stays, with what went wrong above it. */}
      {documents !== null && error ? (
        <>
          <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} />
          <Button title={t.common.retry} kind="secondary" busy={list.fetching} onPress={() => void list.reload()} />
          <View style={styles.gap} />
        </>
      ) : null}

      {documents !== null && documents.length === 0 ? (
        <Quiet title={words.empty.title} body={words.empty.body}>
          <Button title={words.add} onPress={add} />
        </Quiet>
      ) : null}

      {full ? <Notice title={words.full.title(words.count(documents.length))} body={words.full.body} /> : null}

      {documents?.map((doc) => (
        <DocumentListRow key={doc.id} row={documentRow(t, doc, today)} onPress={() => router.push(documentRoute.view(id, doc.id))} />
      ))}
    </Screen>
  )
}

const styles = StyleSheet.create({
  loading: { marginBottom: space.row },
  gap: { height: space.block },
})
