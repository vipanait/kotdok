import { useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { useCached } from '@/lib/query-cache'
import { queryKeys } from '@/lib/query-keys'
import { useText } from '@/i18n'
import { openStoredPdf } from '@/features/documents/document-io'
import { documentFormat, documentTitle, originalBackTitle, originalPage, pdfOpening } from '@/features/documents/document-view'
import { Button } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Screen } from '@/ui/Screen'
import { DetailSkeleton } from '@/ui/Skeleton'
import { Text } from '@/ui/Text'
import { colour, radius, space } from '@/ui/theme'

/** Until a page has loaded and said its own shape: a page of A4, upright. */
const PAGE_RATIO = 210 / 297

/**
 * The original, a page at a time (DOC-1): «Оригинал · страница N из M»,
 * previous and next, the page across the screen's width, and a button at the
 * bottom back to the screen that opened it — the original is pushed over that
 * screen, so back is always there; `?from=` only names it. A PDF opens in the
 * system's viewer through its signed link.
 *
 * No pinch zoom: the app has no zooming pattern yet; the page fills the width.
 */
export default function DocumentOriginal() {
  const { id, docId, page, from } = useLocalSearchParams<{ id: string; docId: string; page?: string; from?: string }>()
  const t = useText()
  const words = t.documents

  const read = useCached(queryKeys.document(id, docId), () => withFreshSession((api) => api.getDocument(id, docId)))
  const doc = read.data?.id === docId ? read.data : null
  const error = read.error ? describeFailure(t, read.error, words.view.loadFailed) : null

  const total = doc?.files.length ?? 0
  // The page turned to; until then the one asked for (`?page=`), once the document says how many there are.
  const [turned, setTurned] = useState<number | null>(null)

  const [ratios, setRatios] = useState<Record<string, number>>({})
  const [failed, setFailed] = useState<string | null>(null)
  const [openFailed, setOpenFailed] = useState(false)

  const back = <Button title={originalBackTitle(t, from)} kind="secondary" onPress={() => router.back()} />

  if (!doc) {
    return (
      <Screen title={words.view.openOriginal} onBack={() => router.back()} backLabel={words.original.back} scroll>
        {error ? (
          <>
            <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} />
            <Button title={t.common.retry} kind="secondary" busy={read.fetching} onPress={() => void read.reload()} />
            <View style={styles.gap} />
            {back}
          </>
        ) : (
          <DetailSkeleton facts={1} />
        )}
      </Screen>
    )
  }

  const name = documentTitle(t, doc)

  if (documentFormat(doc) === 'pdf') {
    const open = async () => setOpenFailed(!(await openStoredPdf(doc.files[0]?.url ?? '')))
    const download = pdfOpening(Platform.OS) === 'download'
    return (
      <Screen title={name} titleLines={0} onBack={() => router.back()} backLabel={words.original.back} subtitle={words.format.pdf} scroll>
        <Text tone="muted" style={styles.gap}>
          {download ? words.original.pdfBodyDownload : words.original.pdfBody}
        </Text>
        {openFailed ? <Banner text={words.view.openFailed} tone="error" /> : null}
        <Button title={download ? words.original.downloadPdf : words.original.openPdf} onPress={() => void open()} />
        <View style={styles.gap} />
        {back}
      </Screen>
    )
  }

  const n = originalPage(String(turned ?? page ?? 1), total)
  const file = doc.files[n - 1]
  const go = (delta: -1 | 1) => {
    setFailed(null)
    setTurned(originalPage(String(n + delta), total))
  }

  return (
    <Screen
      title={name}
      titleLines={0}
      onBack={() => router.back()}
      backLabel={words.original.back}
      subtitle={total > 0 ? words.original.pageOf(n, total) : null}
      scroll
    >
      {/* Every file of a type this build cannot show (a later server's): said, not an empty frame. */}
      {total === 0 ? <Text tone="muted">{words.original.noFiles}</Text> : null}
      {file ? (
        <Image
          key={file.id}
          source={{ uri: file.url, cacheKey: file.id }}
          cachePolicy="memory-disk"
          contentFit="contain"
          transition={0}
          accessible
          accessibilityRole="image"
          accessibilityLabel={words.original.pageAlt(n, total)}
          onLoad={(event) => {
            const { width, height } = event.source
            if (width > 0 && height > 0) setRatios((known) => ({ ...known, [file.id]: width / height }))
          }}
          onError={() => setFailed(file.id)}
          style={[styles.page, { aspectRatio: ratios[file.id] ?? PAGE_RATIO }]}
        />
      ) : null}
      {failed !== null && failed === file?.id ? (
        <View style={styles.after}>
          <Banner text={words.original.imageFailed} tone="error" />
          {/* A link that ran out while the page was open: a fresh read signs a new one. */}
          <Button
            title={t.common.retry}
            kind="secondary"
            busy={read.fetching}
            onPress={() => {
              setFailed(null)
              void read.reload()
            }}
          />
        </View>
      ) : null}

      {total > 1 ? (
        <View style={styles.turns}>
          <View style={styles.turn}>
            <Button title={words.original.previous} kind="secondary" disabled={n <= 1} onPress={() => go(-1)} />
          </View>
          <View style={styles.turn}>
            <Button title={words.original.next} kind="secondary" disabled={n >= total} onPress={() => go(1)} />
          </View>
        </View>
      ) : null}

      {/* A long page: the way back is at the bottom too, not only at the top. */}
      <View style={styles.after}>{back}</View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  gap: { marginBottom: space.block },
  page: { width: '100%', borderRadius: radius.field, backgroundColor: colour.soft },
  after: { marginTop: space.block },
  turns: { flexDirection: 'row', gap: space.row, marginTop: space.block },
  turn: { flex: 1 },
})
