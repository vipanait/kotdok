import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { VACCINE_TARGETS, type HealthEvent, type HealthTarget, type PetSpecies } from '@lapka/contracts'
import { ApiError } from '@lapka/shared'
import { withFreshSession } from '@/lib/api'
import { describeFailure } from '@/lib/errors'
import { dayInput, localToday, parseDayInput } from '@/lib/calendar-day'
import { newRequestKey } from '@/lib/request-key'
import { useText } from '@/i18n'
import { addInterval } from '@lapka/shared'
import { itemName, parasiteGroups, saveSummary, targetList } from '@/features/medical-record/due'
import { ProductSheet, type ProductChoice } from '@/features/medical-record/ProductSheet'
import {
  blankDraft,
  blankItem,
  draftChanged,
  draftFromEvent,
  itemInterval,
  nextDate,
  pickProduct,
  renameItem,
  toggleGroup,
  readDraft,
  type DraftErrors,
  type EventDraft,
  type FormMode,
  type ItemDraft,
  type NextChoice,
} from '@/features/medical-record/event-form'
import { useUnsavedChanges } from '@/features/unsaved/useUnsavedChanges'
import { Button, IconButton, LinkButton } from '@/ui/Button'
import { Banner, Card } from '@/ui/Card'
import { SaveChangesDialog } from '@/ui/Dialog'
import { Chips, Field, Segment, Select } from '@/ui/Field'
import { Screen } from '@/ui/Screen'
import { Text } from '@/ui/Text'
import { space } from '@/ui/theme'

type Params = {
  id: string
  /** vaccination (default) or parasite */
  kind?: string
  /** new (default), edit, complete */
  mode?: string
  status?: string
  eventId?: string
  itemId?: string
}

function targetsFor(species: PetSpecies): HealthTarget[] {
  return VACCINE_TARGETS.filter((target) => (target.species as readonly string[]).includes(species)).map(
    (target) => target.code,
  )
}

/**
 * The record form (M6, M14, M16): a new vaccination or treatment with several items and a
 * next date for each, a correction of one, or «Сделано» on one planned item
 * (§7.16). Saves once however many times «Сохранить» is pressed: each form
 * sends its own Idempotency-Key.
 */
export default function EventForm() {
  const params = useLocalSearchParams<Params>()
  const petId = params.id
  const mode: FormMode = params.mode === 'edit' ? 'edit' : params.mode === 'complete' ? 'complete' : 'new'
  // A new record says its kind; an existing one brings its own when it loads.
  const [kind, setKind] = useState<HealthEvent['kind']>(params.kind === 'parasite' ? 'parasite' : 'vaccination')
  const t = useText()
  const words = t.medicalRecord

  const [species, setSpecies] = useState<PetSpecies | null>(null)
  const [initial, setInitial] = useState<EventDraft | null>(null)
  const [draft, setDraft] = useState<EventDraft | null>(null)
  const [source, setSource] = useState<{ event: HealthEvent; others: number } | null>(null)
  const [keptDate, setKeptDate] = useState<string | undefined>(undefined)
  const [errors, setErrors] = useState<DraftErrors>({})
  const [error, setError] = useState<{ text: string; offline: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const requestKey = useRef(newRequestKey())
  const nextKey = useRef(1)
  /** The item the catalogue sheet is choosing for, or null when it is closed. */
  const [picking, setPicking] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const overview = await withFreshSession((api) => api.getHealthOverview(petId))
      setSpecies(overview.pet.species)

      let start: EventDraft
      if (mode === 'new') {
        start = blankDraft(params.status === 'planned' ? 'planned' : 'done', new Date(), kind)
        start.items = [blankItem('new-0', kind)]
      } else if (mode === 'edit') {
        const event = overview.events.find((e) => e.id === params.eventId)
        if (!event) throw new Error('not found')
        start = draftFromEvent(event)
        setKind(event.kind)
        setKeptDate(event.date)
      } else {
        const event = overview.events.find((e) => e.items.some((item) => item.id === params.itemId))
        const item = event?.items.find((i) => i.id === params.itemId)
        if (!event || !item) throw new Error('not found')
        setSource({ event, others: event.items.length - 1 })
        setKind(event.kind)
        start = {
          kind: event.kind,
          status: 'done',
          date: dayInput(localToday()),
          items: [{ ...draftFromEvent({ ...event, items: [item] }).items[0], next: 'year' }],
          clinic: event.clinic ?? '',
          notes: '',
        }
      }
      setInitial(start)
      setDraft(start)
      // A new record starts from the catalogue (spec §7.9).
      if (mode === 'new') setPicking(start.items[0]?.key ?? null)
    } catch (cause) {
      setError(describeFailure(t, cause, words.loadEventFailed))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the kind of a new record is fixed by the route
  }, [petId, mode, params.status, params.eventId, params.itemId, t, words.loadEventFailed])

  useEffect(() => {
    void load()
  }, [load])

  const changed = draft !== null && initial !== null && draftChanged(initial, draft)
  const unsaved = useUnsavedChanges(changed)

  const change = (patch: Partial<EventDraft>) => setDraft((current) => (current ? { ...current, ...patch } : current))
  const changeItem = (key: string, patch: Partial<ItemDraft>) =>
    setDraft((current) =>
      current
        ? { ...current, items: current.items.map((item) => (item.key === key ? { ...item, ...patch } : item)) }
        : current,
    )

  function rename(key: string, name: string) {
    setDraft((current) =>
      current
        ? { ...current, items: current.items.map((item) => (item.key === key ? renameItem(item, name) : item)) }
        : current,
    )
  }

  function choose(key: string, choice: ProductChoice) {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        items: current.items.map((item) => {
          if (item.key !== key) return item
          if (choice.kind === 'product') return pickProduct(item, choice.product)
          if (choice.kind === 'manual') return { ...renameItem(item, item.source === 'catalog' ? '' : item.name), interval: null }
          return { ...item, name: '', productId: null, interval: null, source: 'none' }
        }),
      }
    })
  }

  const recordDay = draft ? (draft.status === 'done' ? parseDayInput(draft.date) : null) : null
  const showNext = draft !== null && mode !== 'edit' && draft.status === 'done'

  const summary = useMemo(() => {
    if (!draft || !showNext || !recordDay) return null
    if (mode === 'complete') return words.summaryComplete(source?.others ?? 0)
    const days = draft.items.map((item) => nextDate(item, recordDay, localToday()) ?? null)
    return saveSummary(t, days, localToday())
  }, [draft, showNext, recordDay, mode, words, source, t])

  async function save(then: () => void = () => router.back()) {
    if (!draft) return
    const read = readDraft(t, draft, mode, new Date(), keptDate)
    if (!read.ok) {
      setErrors(read.errors)
      return
    }
    setErrors({})
    setBusy(true)
    setError(null)
    try {
      const value = read.value
      await withFreshSession((api) => {
        if (mode === 'edit' && params.eventId) {
          return api.changeHealthEvent(petId, params.eventId, {
            // Only a new day: an overdue plan's own day would be refused as past.
            ...(value.date !== keptDate ? { date: value.date } : {}),
            clinic: value.clinic,
            notes: value.notes,
            items: value.items.map(({ id, name, targets, product_id }) => ({ ...(id ? { id } : {}), name, targets, product_id })),
          })
        }
        if (mode === 'complete' && params.itemId) {
          return api.completeHealthItem(
            petId,
            params.itemId,
            { done_on: value.date, next_on: value.items[0]?.next_on ?? null, clinic: value.clinic, notes: value.notes },
            requestKey.current,
          )
        }
        return api.createHealthEvent(
          petId,
          // readDraft builds the request whole; re-picking fields here once dropped product_id.
          value,
          requestKey.current,
        )
      })
      unsaved.leave(then)
    } catch (cause) {
      // The first try was saved after all, with what it said then; the change
      // since is not. Say so rather than let the person think it went in.
      if (cause instanceof ApiError && cause.code === 'conflict') {
        setError({ text: words.alreadySaved, offline: false })
      } else {
        setError(describeFailure(t, cause, words.saveEventFailed))
      }
    } finally {
      setBusy(false)
    }
  }

  const treatment = kind === 'parasite'
  const title = treatment ? words.treatmentTitle : words.vaccinationTitle

  if (!draft || !species) {
    return (
      <Screen title={title} onBack={() => router.back()}>
        {error ? (
          <>
            <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} />
            <Button title={t.common.retry} kind="secondary" onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    )
  }

  const choices = targetsFor(species).map((code) => ({
    value: code,
    label: (words.targets as Record<string, string>)[code] ?? code,
  }))
  const groupChoices = (['fleas', 'ticks', 'worms'] as const).map((group) => ({
    value: group,
    label: words.parasiteGroups[group],
  }))

  function nextOptions(item: ItemDraft): Array<{ value: NextChoice; label: string }> {
    const interval = itemInterval(item)
    const spoken = words.catalog.interval[interval.unit](interval.value)
    const suggested = recordDay ? addInterval(recordDay, interval) : null
    return [
      {
        value: 'year',
        label: !suggested
          ? words.catalog.nextIn(spoken, '—')
          : suggested >= localToday()
            ? words.catalog.nextIn(spoken, t.day(suggested, true))
            : words.nextPassed,
      },
      { value: 'custom', label: words.nextCustom },
      { value: 'none', label: words.nextNone },
    ]
  }

  return (
    <Screen
      title={title}
      onBack={() => router.back()}
      scroll
      dock={<Button title={t.common.save} onPress={() => void save()} busy={busy} />}
    >
      {mode === 'new' ? (
        <Segment
          label={title}
          labelHidden
          options={[
            { value: 'done', label: words.statusDone },
            { value: 'planned', label: words.statusPlanned },
          ]}
          value={draft.status}
          onChange={(status) =>
            status &&
            change({
              status,
              // A plan has no sensible default day; a done record starts from today.
              date: status === 'done' ? dayInput(localToday()) : '',
            })
          }
          clearable={false}
        />
      ) : null}

      <Field
        label={draft.status === 'done' ? words.whenDone : words.whenPlanned}
        value={draft.date}
        onChangeText={(date) => change({ date })}
        placeholder={words.datePlaceholder}
        keyboardType="numbers-and-punctuation"
        error={errors.date}
      />

      <Text variant="h3" style={styles.heading}>
        {treatment ? words.products : words.vaccines}
      </Text>

      {draft.items.map((item) => (
        <Card key={item.key} outlined style={styles.item}>
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
                  {item.source === 'manual' ? (
                    <>
                      <Field
                        label={words.itemName}
                        value={item.name}
                        onChangeText={(name) => rename(item.key, name)}
                        placeholder={treatment ? words.productNamePlaceholder : words.itemNamePlaceholder}
                        autoCorrect={false}
                      />
                      <LinkButton
                        title={words.catalog.fromList}
                        align="left"
                        onPress={() => setPicking(item.key)}
                      />
                    </>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        item.source === 'unset'
                          ? treatment
                            ? words.catalog.chooseProduct
                            : words.catalog.choose
                          : `${item.name || words.noProduct}, ${words.catalog.change}`
                      }
                      onPress={() => setPicking(item.key)}
                      style={({ pressed }) => [styles.pick, { opacity: pressed ? 0.6 : 1 }]}
                    >
                      <Text variant="bodyStrong" tone="accent">
                        {item.source === 'unset'
                          ? treatment
                            ? words.catalog.chooseProduct
                            : words.catalog.choose
                          : item.name || words.noProduct}
                      </Text>
                      {item.source !== 'unset' ? (
                        <Text variant="label" tone="muted">
                          {words.catalog.change}
                        </Text>
                      ) : null}
                    </Pressable>
                  )}
                </View>
                {draft.items.length > 1 ? (
                  <IconButton
                    icon="close"
                    label={treatment ? words.removeProduct : words.removeVaccine}
                    onPress={() => change({ items: draft.items.filter((other) => other.key !== item.key) })}
                  />
                ) : null}
              </View>
              {treatment ? (
                <Chips
                  label={words.parasiteFrom}
                  options={groupChoices}
                  values={groupChoices
                    .filter(({ value }) => parasiteGroups(item.targets).has(value))
                    .map(({ value }) => value)}
                  onToggle={(group) =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            items: current.items.map((other) => (other.key === item.key ? toggleGroup(other, group) : other)),
                          }
                        : current,
                    )
                  }
                />
              ) : (
                <Chips
                  label={words.diseases}
                  options={choices}
                  values={item.targets}
                  onToggle={(code) =>
                    changeItem(item.key, {
                      targets: item.targets.includes(code)
                        ? item.targets.filter((other) => other !== code)
                        : [...item.targets, code],
                    })
                  }
                />
              )}
            </>
          )}

          {errors.items?.[item.key] ? (
            <Text variant="caption" tone="danger">
              {errors.items[item.key]}
            </Text>
          ) : null}

          {showNext ? (
            <>
              <Select
                label={words.next}
                options={nextOptions(item)}
                value={item.next}
                onChange={(next) => next && changeItem(item.key, { next })}
                allowNone={false}
              />
              {item.next === 'custom' ? (
                <Field
                  label={words.nextDate}
                  value={item.nextText}
                  onChangeText={(nextText) => changeItem(item.key, { nextText })}
                  placeholder={words.datePlaceholder}
                  keyboardType="numbers-and-punctuation"
                  error={errors.next?.[item.key]}
                />
              ) : errors.next?.[item.key] ? (
                <Text variant="caption" tone="danger">
                  {errors.next[item.key]}
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
      ))}

      {errors.form ? <Banner text={errors.form} tone="error" style={styles.gapBottom} /> : null}

      {mode !== 'complete' ? (
        <LinkButton
          title={treatment ? words.addProduct : words.addVaccine}
          align="left"
          onPress={() => {
            const key = `new-${nextKey.current++}`
            change({ items: [...draft.items, blankItem(key, kind)] })
            setPicking(key)
          }}
        />
      ) : null}

      <Field label={words.clinic} value={draft.clinic} onChangeText={(clinic) => change({ clinic })} />
      <Field label={words.notes} value={draft.notes} onChangeText={(notes) => change({ notes })} multiline />

      {summary ? <Banner text={summary} tone="info" style={styles.gapBottom} /> : null}
      {error ? (
        <Banner text={error.text} tone="error" icon={error.offline ? 'wifi' : 'alert'} style={styles.gapBottom} />
      ) : null}

      <ProductSheet
        visible={picking !== null}
        species={species}
        kind={treatment ? 'antiparasitic' : 'vaccine'}
        onPick={(choice) => picking && choose(picking, choice)}
        onClose={() => setPicking(null)}
      />

      <SaveChangesDialog
        visible={unsaved.pending !== null}
        busy={busy}
        onSave={() => {
          const next = unsaved.pending
          unsaved.stay()
          if (next) void save(next)
        }}
        onDiscard={() => unsaved.pending && unsaved.leave(unsaved.pending)}
        onStay={unsaved.stay}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  heading: { marginBottom: space.row },
  item: { padding: 16, gap: space.row },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemName: { flex: 1 },
  fixed: { gap: 2 },
  pick: { minHeight: 44, justifyContent: 'center', gap: 2 },
  gapBottom: { marginBottom: space.block },
})
