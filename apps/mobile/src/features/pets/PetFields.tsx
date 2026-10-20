import { useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { PET_DIETS, PET_LIFESTYLES, PET_SIZE_CLASSES, PET_WALK_ACTIVITIES } from '@lapka/contracts'
import { useText } from '@/i18n'
import { localToday } from '@/lib/calendar-day'
import { DateField } from '@/ui/DateField'
import { Field, Segment, Select, type FieldHandle } from '@/ui/Field'
import { ListField } from '@/ui/ListField'
import { Accordion } from '@/ui/Section'
import { Text } from '@/ui/Text'
import { space } from '@/ui/theme'
import { LIST_MAX_ITEMS, WEIGHT_MAX, switchWeightUnit, type FieldError, type PetForm } from './pet-form'

/** Yes / no / not stated, which a switch cannot express. */
function Tristate({
  label,
  value,
  onChange,
  yes,
  no,
  note,
}: {
  label: string
  value: boolean | null
  onChange: (value: boolean | null) => void
  yes: string
  no: string
  note?: string
}) {
  return (
    <Segment
      label={label}
      note={note}
      options={[
        { value: 'yes' as const, label: yes },
        { value: 'no' as const, label: no },
      ]}
      value={value === null ? null : value ? 'yes' : 'no'}
      onChange={(next) => onChange(next === null ? null : next === 'yes')}
    />
  )
}

/** "2 из 4" — what a closed section is holding, without opening it. */
function tally(
  answers: ReadonlyArray<unknown>,
  count: (filled: number, total: number) => string,
): string | undefined {
  const filled = answers.filter((value) =>
    Array.isArray(value) ? value.some((item: string) => item.trim() !== '') : value !== null && value !== '',
  ).length
  return filled === 0 ? undefined : count(filled, answers.length)
}

/**
 * The pet form itself, shared by the add and edit screens so the two cannot
 * drift apart — the same fields, the same wording, the same rules about which
 * of them a cat has.
 *
 * Sixteen fields in one scroll is what the concept set out to fix: the six
 * everyone fills in stay on screen, and the rest wait behind three sections
 * that say how much is inside them.
 *
 * `invalid` is shown under the field it names, not at the foot of the form:
 * the foot is below the notes, a long way from the name that is missing.
 */
export function PetFields({
  form,
  onChange,
  invalid = null,
  notes = {},
  speciesFixed = false,
}: {
  form: PetForm
  onChange: (patch: Partial<PetForm>) => void
  invalid?: FieldError | null
  /**
   * Standing notes under fields that the medical record expands on — «История
   * веса — в медкарте». Only where the record has something (spec §4).
   */
  notes?: { weight?: string; vaccinated?: string; medications?: string }
  /**
   * An existing pet: the species is named, not offered. A cat does not become
   * a dog, and switching it would re-ask the form and the record in the other
   * animal's terms while its checks stay a cat's.
   */
  speciesFixed?: boolean
}) {
  const t = useText()
  const errorFor = (field: keyof PetForm) => (invalid?.field === field ? invalid.message : null)
  // The field a refused save complains about is brought into view: below the
  // dock its message read as a red frame and nothing else.
  const inputs = useRef(new Map<keyof PetForm, FieldHandle>())
  const input = (field: keyof PetForm) => (node: FieldHandle | null) => {
    if (node) inputs.current.set(field, node)
    else inputs.current.delete(field)
  }
  useEffect(() => {
    if (invalid) inputs.current.get(invalid.field)?.focus()
  }, [invalid])
  const hint = t.placeholders[form.species]
  const sex = form.species === 'dog' ? t.sexDog : t.sexCat
  const isDog = form.species === 'dog'

  const lifestyleAnswers = isDog
    ? [form.indoorOutdoor, form.diet, form.sizeClass, form.walkActivity]
    : [form.indoorOutdoor, form.diet]

  return (
    <>
      {speciesFixed ? (
        <View style={styles.fixed}>
          <Text variant="label" tone="muted">
            {t.petForm.species}
          </Text>
          <Text variant="h3">{t.species[form.species]}</Text>
        </View>
      ) : (
        <Segment
          label={t.petForm.species}
          clearable={false}
          options={[
            { value: 'cat' as const, label: t.species.cat },
            { value: 'dog' as const, label: t.species.dog },
          ]}
          value={form.species}
          onChange={(species) => onChange({ species: species ?? 'cat' })}
        />
      )}

      <Field
        label={t.petForm.name}
        value={form.name}
        onChangeText={(name) => onChange({ name })}
        error={errorFor('name')}
        fieldRef={input('name')}
        placeholder={hint.name}
        autoCorrect={false}
      />
      <Field
        label={t.petForm.breed}
        value={form.breed}
        onChangeText={(breed) => onChange({ breed })}
        placeholder={hint.breed}
        autoCorrect={false}
      />
      {/* A shelter cat has no papers: «about» is as good an answer as a date (FB-2/01). */}
      <Segment
        label={t.petForm.birth}
        clearable={false}
        options={[
          { value: 'exact' as const, label: t.petForm.birthExact },
          { value: 'approx' as const, label: t.petForm.birthApprox },
        ]}
        value={form.birthMode}
        onChange={(birthMode) => birthMode && onChange({ birthMode })}
      />
      {form.birthMode === 'exact' ? (
        <DateField
          label={t.petForm.birthDate}
          value={form.birthDate}
          onChangeText={(birthDate) => onChange({ birthDate })}
          placeholder={t.medicalRecord.datePlaceholder}
          max={localToday()}
          error={errorFor('birthDate')}
        fieldRef={input('birthDate')}
        />
      ) : (
        <View style={styles.approx}>
          <Field
            label={t.petForm.approxYears}
            value={form.approxYears}
            onChangeText={(approxYears) => onChange({ approxYears })}
            error={errorFor('approxYears')}
        fieldRef={input('approxYears')}
            keyboardType="numeric"
            style={styles.approxField}
          />
          <Field
            label={t.petForm.approxMonths}
            value={form.approxMonths}
            onChangeText={(approxMonths) => onChange({ approxMonths })}
            error={errorFor('approxMonths')}
        fieldRef={input('approxMonths')}
            keyboardType="numeric"
            style={styles.approxField}
          />
        </View>
      )}
      <DateField
        label={t.petForm.adoptedOn}
        value={form.adoptedOn}
        onChangeText={(adoptedOn) => onChange({ adoptedOn })}
        placeholder={t.medicalRecord.datePlaceholder}
        max={localToday()}
        error={errorFor('adoptedOn')}
        fieldRef={input('adoptedOn')}
      />
      <Field
        label={form.weightUnit === 'g' ? t.petForm.weightGrams : t.petForm.weight(WEIGHT_MAX)}
        value={form.weightKg}
        onChangeText={(weightKg) => onChange({ weightKg })}
        error={errorFor('weightKg')}
        fieldRef={input('weightKg')}
        hint={notes.weight}
        keyboardType="numeric"
        style={styles.weightField}
      />
      {/* A newborn weighs less than the field's 0,1 kg (FB-2/05). */}
      <Segment
        label={t.petForm.weightGrams}
        labelHidden
        clearable={false}
        options={[
          { value: 'kg' as const, label: t.medicalRecord.units.kg },
          { value: 'g' as const, label: t.medicalRecord.units.g },
        ]}
        value={form.weightUnit}
        onChange={(unit) => unit && onChange(switchWeightUnit(form, unit))}
      />
      <Segment
        label={t.petForm.sex}
        options={[
          { value: 'male' as const, label: sex.male },
          { value: 'female' as const, label: sex.female },
        ]}
        value={form.sex}
        onChange={(value) => onChange({ sex: value })}
      />

      <Accordion
        title={t.petForm.health}
        count={tally(
          [
            form.neutered,
            form.vaccinated,
            form.allergies,
            form.chronicConditions,
            form.medications,
          ],
          t.petForm.filledOf,
        )}
      >
        <Tristate
          label={t.petForm.neutered}
          yes={t.petForm.yes}
          no={t.petForm.no}
          value={form.neutered}
          onChange={(neutered) => onChange({ neutered })}
        />
        <Tristate
          label={t.petForm.vaccinated}
          value={form.vaccinated}
          onChange={(vaccinated) => onChange({ vaccinated })}
          yes={t.petForm.vaccinatedYes}
          no={t.petForm.no}
          note={notes.vaccinated}
        />
        <ListField
          label={t.petForm.allergies}
          values={form.allergies}
          onChange={(allergies) => onChange({ allergies })}
          placeholder={t.petForm.allergiesHint}
          addLabel={t.petForm.addLine}
          removeLabel={t.petForm.removeLine}
          max={LIST_MAX_ITEMS}
          autoCapitalize="none"
        />
        <ListField
          label={t.petForm.chronic}
          values={form.chronicConditions}
          onChange={(chronicConditions) => onChange({ chronicConditions })}
          placeholder={hint.chronic}
          addLabel={t.petForm.addLine}
          removeLabel={t.petForm.removeLine}
          max={LIST_MAX_ITEMS}
        />
        <ListField
          label={t.petForm.medications}
          values={form.medications}
          onChange={(medications) => onChange({ medications })}
          placeholder={hint.medications}
          hint={notes.medications}
          addLabel={t.petForm.addLine}
          removeLabel={t.petForm.removeLine}
          max={LIST_MAX_ITEMS}
        />
      </Accordion>

      <Accordion title={t.petForm.lifestyle} count={tally(lifestyleAnswers, t.petForm.filledOf)}>
        <Segment
          label={t.petForm.keeping}
          options={PET_LIFESTYLES.map((value) => ({ value, label: t.lifestyle[value] }))}
          value={form.indoorOutdoor}
          onChange={(indoorOutdoor) => onChange({ indoorOutdoor })}
        />
        <Select
          label={t.petForm.diet}
          options={PET_DIETS.map((value) => ({ value, label: t.diet[value] }))}
          value={form.diet}
          onChange={(diet) => onChange({ diet })}
        />

        {/* Size and walking are asked of dogs only; the contract refuses them on a cat. */}
        {isDog ? (
          <>
            <Select
              label={t.petForm.size}
              options={PET_SIZE_CLASSES.map((value) => ({ value, label: t.size[value] }))}
              value={form.sizeClass}
              onChange={(sizeClass) => onChange({ sizeClass })}
            />
            <Select
              label={t.petForm.walk}
              options={PET_WALK_ACTIVITIES.map((value) => ({ value, label: t.walk[value] }))}
              value={form.walkActivity}
              onChange={(walkActivity) => onChange({ walkActivity })}
            />
          </>
        ) : null}
      </Accordion>

      <Accordion title={t.petForm.notes} count={tally([form.notes], t.petForm.filledOf)}>
        <Field
          label={t.petForm.notes}
          labelHidden
          value={form.notes}
          onChangeText={(notes) => onChange({ notes })}
          multiline
        />
      </Accordion>
    </>
  )
}

const styles = StyleSheet.create({
  // As the check form names its only pet: a label over the value, spaced like a field.
  fixed: { marginBottom: space.block, gap: 6 },
  approx: { flexDirection: 'row', gap: space.row },
  approxField: { flex: 1 },
  weightField: { marginBottom: space.row },
})
