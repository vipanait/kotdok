import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { SAFETY_CATEGORIES, SAFETY_QUERY_MAX, type PetSpecies, type SafetyCategory, type SafetyIndexItem } from '@lapka/contracts'
import { matchSafety, normalizeSafetyQuery, verdictLabelKey } from '@lapka/shared'
import { useText } from '@/i18n'
import { Button } from '@/ui/Button'
import { Field, Segment } from '@/ui/Field'
import { Icon } from '@/ui/Icon'
import { ListSkeleton } from '@/ui/Skeleton'
import { Text } from '@/ui/Text'
import { TAP_TARGET, colour, radius, space } from '@/ui/theme'
import { VerdictBadge, verdictTone } from './VerdictBadge'

/**
 * «Часто спрашивают» before anything is typed: what people most often ask
 * about first (the six /otravlenie topics among them), then the rest by name.
 * Slugs the index does not hold — not written yet, or not published — are
 * skipped, so the list is never a row short of a link.
 */
export const POPULAR_SLUGS = [
  'shokolad',
  'vinograd',
  'luk-chesnok',
  'ksilit',
  'liliya',
  'ibuprofen',
  'paracetamol',
  'antifriz',
  'moloko',
  'morkov',
  'yabloko',
  'hlorofitum',
  'avokado',
  'banan',
  'arbuz',
] as const

const POPULAR_SHOWN = 12

function popular(items: readonly SafetyIndexItem[]): SafetyIndexItem[] {
  const rank = (slug: string) => {
    const at = (POPULAR_SLUGS as readonly string[]).indexOf(slug)
    return at === -1 ? POPULAR_SLUGS.length : at
  }
  return [...items]
    .sort((a, b) => rank(a.slug) - rank(b.slug) || a.name.localeCompare(b.name))
    .slice(0, POPULAR_SHOWN)
}

/**
 * The tab's search: the field, the recent queries, and under them either the
 * suggestions for what is typed (from the cached index, without the network)
 * or the popular entries by category. Nothing found offers the AI question.
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
  const typed = normalizeSafetyQuery(query).length > 0
  const found = useMemo(() => (items && typed ? matchSafety(items, query) : null), [items, query, typed])

  const field = (
    <Field
      label={t.safety.search}
      labelHidden
      value={query}
      onChangeText={(text) => onQuery(text.slice(0, SAFETY_QUERY_MAX))}
      placeholder={t.safety.searchPlaceholder}
      autoCorrect={false}
      action={query ? { icon: 'close', label: t.safety.clear, onPress: () => onQuery('') } : undefined}
    />
  )

  const recentRow =
    !typed && recent.length > 0 ? (
      <View style={styles.recent}>
        <Text variant="label" tone="muted" style={styles.recentTitle}>
          {t.safety.recent}
        </Text>
        <View style={styles.chips}>
          {recent.map((item) => (
            <Pressable
              key={item}
              accessibilityRole="button"
              onPress={() => onQuery(item)}
              style={({ pressed }) => [styles.chip, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text variant="label">{item}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    ) : null

  if (items === null) {
    return (
      <>
        {field}
        <ListSkeleton rows={4} />
      </>
    )
  }

  const row = (item: SafetyIndexItem) => {
    const verdict = item.verdict[species]
    const label = t.safety.verdict[verdictLabelKey(item.category, verdict)]
    return (
      <Pressable
        key={item.slug}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}: ${label}`}
        onPress={() => onOpen(item)}
        style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
      >
        <View style={[styles.dot, { backgroundColor: verdictTone(verdict).signal }]} />
        <Text style={styles.rowName} numberOfLines={2}>
          {item.name}
        </Text>
        <VerdictBadge verdict={verdict} label={label} />
      </Pressable>
    )
  }

  if (found) {
    return (
      <>
        {field}
        {found.suggestions.length > 0 ? (
          <View>{found.suggestions.map(row)}</View>
        ) : (
          <View style={styles.miss}>
            <Text variant="h3" style={styles.missTitle}>
              {t.safety.notInReference(query.trim())}
            </Text>
            <Button title={t.safety.askAi} onPress={() => onAsk(query.trim())} />
            <Text variant="caption" tone="faint" center style={styles.aiLine}>
              {aiLine}
            </Text>
          </View>
        )}
      </>
    )
  }

  if (items.length === 0) {
    // Nothing published yet (the app may reach the stores before the
    // reference does): say so, and leave the AI question open above.
    return (
      <>
        {field}
        {recentRow}
        <View style={styles.soon}>
          <Icon name="bowl" size={40} color={colour.faint} />
          <Text variant="h3" center style={styles.soonTitle}>
            {t.safety.comingSoon}
          </Text>
          <Text tone="muted" center>
            {t.safety.comingSoonBody}
          </Text>
          <Text variant="caption" tone="faint" center style={styles.aiLine}>
            {aiLine}
          </Text>
        </View>
      </>
    )
  }

  const listed = category
    ? items.filter((item) => item.category === category).sort((a, b) => a.name.localeCompare(b.name))
    : popular(items)

  return (
    <>
      {field}
      {recentRow}
      <Text variant="h3" style={styles.popularTitle}>
        {t.safety.popular}
      </Text>
      <Segment<SafetyCategory>
        label={t.safety.popular}
        labelHidden
        options={SAFETY_CATEGORIES.map((value) => ({ value, label: t.safety.categories[value] }))}
        value={category}
        onChange={setCategory}
      />
      <View>{listed.map(row)}</View>
    </>
  )
}

const styles = StyleSheet.create({
  recent: { marginBottom: space.block },
  recentTitle: { marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colour.soft,
  },
  popularTitle: { marginBottom: space.row },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: TAP_TARGET + 8,
    borderBottomWidth: 1,
    borderBottomColor: colour.line,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowName: { flex: 1 },
  miss: { marginTop: 8 },
  missTitle: { marginBottom: space.row },
  aiLine: { marginTop: 8 },
  soon: { alignItems: 'center', marginTop: space.block, gap: 8 },
  soonTitle: { marginTop: 4 },
})
