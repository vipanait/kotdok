import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { SAFETY_CATEGORIES, SAFETY_QUERY_MAX, type PetSpecies, type SafetyCategory, type SafetyIndexItem } from '@lapka/contracts'
import { safetyCategoryIcon, verdictLabelKey } from '@lapka/shared'
import { useText } from '@/i18n'
import { Button } from '@/ui/Button'
import { Field } from '@/ui/Field'
import { Icon } from '@/ui/Icon'
import { ListSkeleton } from '@/ui/Skeleton'
import { CONTROL_FONT_LIMIT, Text } from '@/ui/Text'
import { TAP_TARGET, colour, radius, space } from '@/ui/theme'
import { SafetyIcon, SAFETY_ICON_SIZE } from './icons/SafetyIcon'
import { SafetyState } from './SafetyParts'
import { searchView, type SafetyRow } from './search-model'
import { VerdictBadge } from './VerdictBadge'

export { POPULAR_SLUGS } from './search-model'

/** A round chip, 44 tall: a category with its picture, or a recent query. */
function Chip({
  label,
  chosen = false,
  icon,
  onPress,
}: {
  label: string
  chosen?: boolean
  icon?: SafetyCategory
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: chosen }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, chosen ? styles.chipChosen : null, { opacity: pressed ? 0.7 : 1 }]}
    >
      {icon ? <SafetyIcon name={safetyCategoryIcon(icon)} size={SAFETY_ICON_SIZE.chip} /> : null}
      <Text variant="label" tone={chosen ? 'inverse' : 'default'} maxFontSizeMultiplier={CONTROL_FONT_LIMIT}>
        {label}
      </Text>
    </Pressable>
  )
}

/**
 * The tab's search: the field, the category chips, the recent queries, and
 * under them the popular entries, a category, the matches for what is typed
 * (inside the chosen category — from the cached index, without the network),
 * or nothing found with the AI question (`search-model`).
 */
export function SafetySearch({
  items,
  species,
  recent,
  query,
  onQuery,
  onOpen,
  onAsk,
  aiLine,
}: {
  /** The index; null while it loads for the first time. */
  items: readonly SafetyIndexItem[] | null
  species: PetSpecies
  recent: readonly string[]
  query: string
  onQuery: (query: string) => void
  onOpen: (item: SafetyIndexItem) => void
  onAsk: (query: string) => void
  /** «до 10 ответов ИИ в сутки» or what the last answer left. */
  aiLine: string
}) {
  const t = useText()
  const [category, setCategory] = useState<SafetyCategory | null>(null)
  const view = useMemo(() => searchView(items, query, category), [items, query, category])
  const typed = view.kind === 'results' || view.kind === 'miss'

  const field = (
    <Field
      label={t.safety.search}
      labelHidden
      value={query}
      onChangeText={(text) => onQuery(text.slice(0, SAFETY_QUERY_MAX))}
      placeholder={t.safety.searchPlaceholder}
      autoCorrect={false}
      action={query ? { icon: 'close', label: t.safety.clear, onPress: () => onQuery('') } : undefined}
      style={styles.field}
    />
  )

  if (view.kind === 'loading') {
    return (
      <>
        {field}
        <ListSkeleton rows={4} />
      </>
    )
  }

  const chips =
    items && items.length > 0 ? (
      <View style={styles.chips}>
        <Chip label={t.safety.allCategories} chosen={category === null} onPress={() => setCategory(null)} />
        {SAFETY_CATEGORIES.map((value) => (
          <Chip
            key={value}
            label={t.safety.categories[value]}
            icon={value}
            chosen={category === value}
            onPress={() => setCategory(category === value ? null : value)}
          />
        ))}
      </View>
    ) : null

  const recentRow =
    !typed && recent.length > 0 ? (
      <View style={styles.recent}>
        <Text variant="label" tone="muted">
          {t.safety.recent}
        </Text>
        {recent.map((item) => (
          <Chip key={item} label={item} onPress={() => onQuery(item)} />
        ))}
      </View>
    ) : null

  const row = ({ item, icon }: SafetyRow) => {
    const verdict = item.verdict[species]
    const label = t.safety.verdict[verdictLabelKey(item.category, verdict)]
    return (
      <Pressable
        key={item.slug}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}: ${label}`}
        onPress={() => onOpen(item)}
        style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
      >
        <View style={styles.tile}>
          <SafetyIcon name={icon} size={SAFETY_ICON_SIZE.card} />
        </View>
        <View style={styles.rowText}>
          <Text variant="h3" numberOfLines={3}>
            {item.name}
          </Text>
          <VerdictBadge verdict={verdict} label={label} />
        </View>
        <Icon name="chevron" size={20} color={colour.text} />
      </Pressable>
    )
  }

  const list = (title: string, rows: SafetyRow[]) => (
    <>
      <Text variant="h2" accessibilityRole="header" style={styles.listTitle}>
        {title}
      </Text>
      <View style={styles.rows}>{rows.map(row)}</View>
    </>
  )

  return (
    <>
      {field}
      {chips}
      {recentRow}
      {view.kind === 'popular' ? list(t.safety.popular, view.rows) : null}
      {view.kind === 'category' && category ? list(t.safety.categories[category], view.rows) : null}
      {view.kind === 'results' ? list(t.safety.results, view.rows) : null}
      {view.kind === 'miss' && view.elsewhere && category ? (
        // In the reference, under another chip: the way there first, the AI question still open.
        <SafetyState
          icon="search"
          title={t.safety.notInCategory(query.trim(), t.safety.categories[category])}
          body={t.safety.notInCategoryBody}
        >
          <Button title={t.safety.otherCategories} onPress={() => setCategory(null)} />
          <Button title={t.safety.askAi} kind="secondary" onPress={() => onAsk(query.trim())} />
          <Text variant="caption" tone="faint" center>
            {aiLine}
          </Text>
        </SafetyState>
      ) : null}
      {view.kind === 'miss' && !(view.elsewhere && category) ? (
        <SafetyState icon="search" title={t.safety.notInReference(query.trim())} body={t.safety.notInReferenceBody}>
          {/* Asked only on this press: typing never spends an AI answer. */}
          <Button title={t.safety.askAi} onPress={() => onAsk(query.trim())} />
          <Text variant="caption" tone="faint" center>
            {aiLine}
          </Text>
        </SafetyState>
      ) : null}
      {view.kind === 'emptyCatalogue' ? (
        // Nothing published yet (the app may reach the stores before the
        // reference does): say so, and leave the AI question open above.
        <SafetyState icon="bowl" title={t.safety.comingSoon} body={t.safety.comingSoonBody}>
          <Text variant="caption" tone="faint" center>
            {aiLine}
          </Text>
        </SafetyState>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  field: { marginBottom: space.row },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: space.row },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: TAP_TARGET,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colour.soft,
  },
  chipChosen: { backgroundColor: colour.accent },
  recent: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: space.row },
  listTitle: { marginTop: space.block, marginBottom: space.row },
  rows: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: TAP_TARGET + 8,
    padding: 15,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colour.line,
    backgroundColor: colour.surface,
  },
  rowPressed: { borderColor: colour.accent },
  tile: {
    width: 54,
    height: 58,
    borderRadius: 13,
    backgroundColor: colour.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 8, alignItems: 'flex-start' },
})
