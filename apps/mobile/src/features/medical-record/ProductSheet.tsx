import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import type { HealthProduct, PetSpecies, ProductKind } from '@lapka/contracts'
import { matchesCatalog } from '@lapka/shared'
import { withFreshSession } from '@/lib/api'
import { useText } from '@/i18n'
import { IconButton } from '@/ui/Button'
import { Banner } from '@/ui/Card'
import { Field } from '@/ui/Field'
import { Icon } from '@/ui/Icon'
import { Text } from '@/ui/Text'
import { CONTROL_HEIGHT, colour, radius, space } from '@/ui/theme'
import { targetList } from './due'

export type ProductChoice =
  | { kind: 'product'; product: HealthProduct }
  | { kind: 'manual' }
  | { kind: 'targets' }

/**
 * Picking a vaccine (M7, X-catalog-*). The search field is not focused on
 * open: the popular ones come first, and a keyboard over them would hide the
 * list the owner most likely wants. The two rows for a name of their own and
 * for «Без препарата» are always there — a failed or empty catalogue never
 * stops a record being made (MR-04.4).
 */
export function ProductSheet({
  visible,
  species,
  kind,
  onPick,
  onClose,
}: {
  visible: boolean
  species: PetSpecies
  kind: ProductKind
  onPick: (choice: ProductChoice) => void
  onClose: () => void
}) {
  const t = useText()
  const words = t.medicalRecord.catalog
  const [products, setProducts] = useState<HealthProduct[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!visible) return
    setQuery('')
    if (products) return
    setFailed(false)
    withFreshSession((api) => api.getCatalog(species, kind))
      .then(setProducts)
      .catch(() => setFailed(true))
  }, [visible, species, kind, products])

  const shown = useMemo(() => {
    if (!products) return []
    if (query.trim() === '') return products.filter((product) => product.popular)
    return products.filter((product) => matchesCatalog(product, query))
  }, [products, query])

  const pick = (choice: ProductChoice) => {
    onPick(choice)
    onClose()
  }

  const escapes = (
    <>
      <Row title={words.manual} onPress={() => pick({ kind: 'manual' })} />
      <Row title={words.targetsOnly} onPress={() => pick({ kind: 'targets' })} />
    </>
  )

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessible={false}>
        <Pressable
          style={styles.sheet}
          onPress={() => {}}
          accessible={false}
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
        >
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text variant="h2" style={styles.title}>
              {kind === 'vaccine' ? words.vaccineTitle : words.productTitle}
            </Text>
            <IconButton icon="close" label={t.common.cancel} onPress={onClose} />
          </View>
          <Field label={words.search} labelHidden value={query} onChangeText={setQuery} placeholder={words.search} autoCorrect={false} />

          <ScrollView keyboardShouldPersistTaps="handled" style={styles.list}>
            {failed ? <Banner text={words.failed} tone="error" style={styles.banner} /> : null}
            {!products && !failed ? <ActivityIndicator color={colour.accent} style={styles.loading} /> : null}

            {products && query.trim() !== '' && shown.length === 0 ? (
              <>
                <Text tone="muted" style={styles.nothing}>
                  {words.nothing}
                </Text>
                {escapes}
              </>
            ) : null}

            {products && shown.length > 0 ? (
              <>
                <Text variant="label" tone="muted" style={styles.group}>
                  {query.trim() === '' ? words.popular[species] : words.results}
                </Text>
                {shown.map((product) => (
                  <Row
                    key={product.id}
                    title={product.name}
                    detail={[product.form ? (words.forms as Record<string, string>)[product.form] ?? product.form : null, targetList(t, product.targets)]
                      .filter(Boolean)
                      .join(' · ')}
                    onPress={() => pick({ kind: 'product', product })}
                  />
                ))}
              </>
            ) : null}

            {!(products && query.trim() !== '' && shown.length === 0) ? escapes : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function Row({ title, detail, onPress }: { title: string; detail?: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={styles.rowCopy}>
        <Text variant="bodyStrong">{title}</Text>
        {detail ? (
          <Text variant="label" tone="muted">
            {detail}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron" size={20} color={colour.faint} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(31,27,21,0.45)', justifyContent: 'flex-end' },
  sheet: {
    height: '90%',
    backgroundColor: colour.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: space.gutter,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colour.line,
    borderRadius: radius.pill,
    alignSelf: 'center',
    marginBottom: space.row,
  },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: space.row },
  title: { flex: 1 },
  list: { flex: 1 },
  banner: { marginBottom: space.row },
  loading: { marginVertical: space.block },
  nothing: { marginVertical: space.row },
  group: { marginTop: 4, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: CONTROL_HEIGHT + 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colour.line,
  },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
})
