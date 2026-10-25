import { StyleSheet, View } from 'react-native'
import type { PetSpecies } from '@lapka/contracts'
import { parasiteGroups, vaccineTargetsFor } from '@lapka/shared'
import { useLocale, useText } from '@/i18n'
import { localToday } from '@/lib/calendar-day'
import { IconButton } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { DateField } from '@/ui/DateField'
import { Chips, Select } from '@/ui/Field'
import { Text } from '@/ui/Text'
import { space } from '@/ui/theme'
import { itemName, targetList } from './due'
import { nextChoices, pickProduct, renameItem, toggleGroup, toggleTarget, type FormMode, type ItemDraft } from './event-form'
import { ProductInput } from './ProductInput'

/**
 * One vaccine or product of the record form: what it was (the catalogue, a
 * name of one's own, or none) and against what, and — on a done record — when
 * it is next. On «Сделано» the item is fixed and only its next date is asked.
 */
export function EventItemCard({
  item,
  species,
  mode,
  treatment,
  showNext,
  recordDay,
  error,
  nextError,
  onUpdate,
  onRemove,
}: {
  item: ItemDraft
  species: PetSpecies
  mode: FormMode
  treatment: boolean
  showNext: boolean
  recordDay: string | null
  error?: string
  nextError?: string
  onUpdate: (next: (item: ItemDraft) => ItemDraft) => void
  /** Absent while the record has only this item. */
  onRemove?: () => void
}) {
  const t = useText()
  const locale = useLocale()
  const words = t.medicalRecord
  const choices = vaccineTargetsFor(species).map((code) => ({
    value: code,
    label: (words.targets as Record<string, string>)[code] ?? code,
  }))
  const groupChoices = (['fleas', 'ticks', 'worms'] as const).map((group) => ({
    value: group,
    label: words.parasiteGroups[group],
  }))

  return (
    <Card outlined style={styles.item}>
      {mode === 'complete' ? (
        <View style={styles.fixed}>
          <Text variant="bodyStrong">{itemName(t, { name: item.name || null, targets: item.targets })}</Text>
          {item.name && item.targets.length > 0 ? (
            <Text variant="label" tone="muted">
              {targetList(t, item.targets)}
            </Text>
          ) : null}
        </View>
      ) : (
        <>
          <View style={styles.itemHead}>
            <View style={styles.itemName}>
              <ProductInput
                item={item}
                species={species}
                kind={treatment ? 'antiparasitic' : 'vaccine'}
                // Typing over a picked product makes the name the owner's own.
                onType={(name) => onUpdate((current) => ({ ...renameItem(current, name), interval: null }))}
                onPick={(product) => onUpdate((current) => pickProduct(current, product, locale))}
                onNoProduct={() =>
                  onUpdate((current) => ({ ...current, name: '', productId: null, interval: null, source: 'none' }))
                }
              />
            </View>
            {onRemove ? (
              <IconButton icon="close" label={treatment ? words.removeProduct : words.removeVaccine} onPress={onRemove} />
            ) : null}
          </View>
          {treatment ? (
            <Chips
              label={words.parasiteFrom}
              options={groupChoices}
              values={groupChoices.filter(({ value }) => parasiteGroups(item.targets).includes(value)).map(({ value }) => value)}
              onToggle={(group) => onUpdate((current) => toggleGroup(current, group))}
            />
          ) : (
            <Chips
              label={words.diseases}
              options={choices}
              values={item.targets}
              // Changing what it was against lets go of a picked vaccine (toggleTarget).
              onToggle={(code) => onUpdate((current) => toggleTarget(current, code))}
            />
          )}
        </>
      )}

      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : null}

      {showNext ? (
        <>
          <Select
            label={words.next}
            options={nextChoices(t, item, recordDay, localToday())}
            value={item.next}
            onChange={(next) => next && onUpdate((current) => ({ ...current, next }))}
            allowNone={false}
          />
          {item.next === 'custom' ? (
            <DateField
              label={words.nextDate}
              value={item.nextText}
              onChangeText={(nextText) => onUpdate((current) => ({ ...current, nextText }))}
              placeholder={words.datePlaceholder}
              min={recordDay ?? undefined}
              error={nextError}
            />
          ) : nextError ? (
            <Text variant="caption" tone="danger">
              {nextError}
            </Text>
          ) : null}
          {item.next === 'year' ? (
            <Text variant="caption" tone="faint">
              {item.productId ? words.catalog.suggestedNote : treatment ? words.nextNoteTreatment : words.nextNote}
            </Text>
          ) : null}
        </>
      ) : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  item: { padding: 16, gap: space.row },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemName: { flex: 1 },
  fixed: { gap: 2 },
})
