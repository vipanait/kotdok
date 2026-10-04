import { useRef, useState } from 'react'
import { Keyboard, Pressable, StyleSheet, View } from 'react-native'
import type { HealthProduct, PetSpecies, ProductKind } from '@lapka/contracts'
import { withFreshSession } from '@/lib/api'
import { useText } from '@/i18n'
import { LinkButton } from '@/ui/Button'
import { Field } from '@/ui/Field'
import { Blank } from '@/ui/Skeleton'
import { Text } from '@/ui/Text'
import { CONTROL_HEIGHT, colour, radius, space } from '@/ui/theme'
import { targetList } from './due'
import type { ItemDraft } from './event-form'
import { suggestProducts } from './product-search'

/**
 * The catalogue, once per species and kind for the life of the app: several
 * items on one form, and the next form, ask for the same list.
 */
const catalogues = new Map<string, Promise<HealthProduct[]>>()

function loadCatalogue(species: PetSpecies, kind: ProductKind): Promise<HealthProduct[]> {
  const key = `${species}:${kind}`
  let loading = catalogues.get(key)
  if (!loading) {
    loading = withFreshSession((api) => api.getCatalog(species, kind))
    // A failed load is not kept: the next focus tries again.
    loading.catch(() => catalogues.delete(key))
    catalogues.set(key, loading)
  }
  return loading
}

/**
 * The vaccine or product of one record item: a field that suggests as it is
 * typed in.
 *
 * It replaces a sheet that opened over the form by itself, before the owner
 * had asked for anything, which read as a wall of drug names. Now nothing
 * appears until the field is tapped: then the popular ones, and from the third
 * letter the matches. A name that is not in the catalogue is kept as typed, and
 * «Без препарата» stays one tap away (MR-04.4: a missing catalogue never stops
 * a record).
 */
export function ProductInput({
  item,
  species,
  kind,
  onType,
  onPick,
  onNoProduct,
}: {
  item: ItemDraft
  species: PetSpecies
  kind: ProductKind
  onType: (name: string) => void
  onPick: (product: HealthProduct) => void
  onNoProduct: () => void
}) {
  const t = useText()
  const words = t.medicalRecord.catalog
  const [open, setOpen] = useState(false)
  const [products, setProducts] = useState<HealthProduct[] | null>(null)
  const [failed, setFailed] = useState(false)
  /**
   * What had been typed when a suggestion was picked. Closing the keyboard
   * makes iOS send the field's last text once more, after the pick, and taken
   * as typing it put «ноб» back in place of «Нобивак Rabies».
   */
  const typedAtPick = useRef<string | null>(null)

  function focus() {
    setOpen(true)
    if (products) return
    setFailed(false)
    loadCatalogue(species, kind)
      .then(setProducts)
      .catch(() => setFailed(true))
  }

  function pick(product: HealthProduct) {
    typedAtPick.current = typed
    onPick(product)
    setOpen(false)
    Keyboard.dismiss()
  }

  const typed = item.source === 'none' ? '' : item.name
  const shown = products ? suggestProducts(products, typed) : null

  return (
    <View>
      <Field
        label={kind === 'vaccine' ? words.vaccineTitle : words.productTitle}
        value={typed}
        onChangeText={(text) => {
          const stale = typedAtPick.current
          typedAtPick.current = null
          if (stale !== null && text === stale) return
          onType(text)
        }}
        placeholder={kind === 'vaccine' ? t.medicalRecord.itemNamePlaceholder : t.medicalRecord.productNamePlaceholder}
        autoCorrect={false}
        hint={item.source === 'none' && !open ? words.noneChosen : undefined}
        onFocus={focus}
        onBlur={() => setOpen(false)}
        style={open ? styles.fieldOpen : undefined}
      />

      {open ? (
        <View style={styles.panel} accessibilityLiveRegion="polite">
          {failed ? (
            <Text tone="muted" style={styles.note}>
              {words.failed}
            </Text>
          ) : !shown ? (
            <View style={styles.loading} accessible accessibilityLabel={t.common.loading}>
              <Blank width="70%" />
              <Blank width="50%" />
            </View>
          ) : shown.kind === 'typing' ? (
            <Text tone="muted" style={styles.note}>
              {words.typeMore}
            </Text>
          ) : shown.kind === 'nothing' ? (
            <View style={styles.note}>
              <Text tone="muted">{words.nothing}</Text>
              <Text variant="caption" tone="faint">
                {words.keepTyped}
              </Text>
            </View>
          ) : (
            <>
              <Text variant="label" tone="muted" style={styles.group}>
                {shown.kind === 'popular' ? words.popular[species] : words.results}
              </Text>
              {shown.products.map((product) => {
                const detail = [
                  product.form ? (words.forms as Record<string, string>)[product.form] ?? product.form : null,
                  targetList(t, product.targets),
                ]
                  .filter(Boolean)
                  .join(' · ')
                return (
                  <Pressable
                    key={product.id}
                    accessibilityRole="button"
                    accessibilityLabel={detail ? `${product.name}, ${detail}` : product.name}
                    onPress={() => pick(product)}
                    style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Text>{product.name}</Text>
                    {detail ? (
                      <Text variant="caption" tone="faint">
                        {detail}
                      </Text>
                    ) : null}
                  </Pressable>
                )
              })}
            </>
          )}
        </View>
      ) : null}

      {item.source !== 'none' ? (
        <LinkButton title={words.targetsOnly} align="left" onPress={onNoProduct} />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  // The panel hangs off the field, so the field gives up its own gap below.
  fieldOpen: { marginBottom: 4 },
  panel: {
    borderWidth: 1,
    borderColor: colour.line,
    borderRadius: radius.field,
    backgroundColor: colour.surface,
    paddingVertical: 4,
    marginBottom: space.row,
  },
  group: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4 },
  row: {
    minHeight: CONTROL_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colour.line,
    gap: 2,
  },
  note: { paddingHorizontal: 14, paddingVertical: 12, gap: 4 },
  loading: { paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
})
