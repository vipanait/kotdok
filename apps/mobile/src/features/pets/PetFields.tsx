import { PET_DIETS, PET_LIFESTYLES, PET_SIZE_CLASSES, PET_WALK_ACTIVITIES } from '@lapka/contracts'
import { useText } from '@/i18n'
import { Field, Segment, Select } from '@/ui/Field'
import { Accordion } from '@/ui/Section'
import { AGE_MAX, WEIGHT_MAX, type PetForm } from './pet-form'

/** Yes / no / not stated, which a switch cannot express. */
function Tristate({
  label,
  value,
  onChange,
  yes,
  no,
}: {
  label: string
  value: boolean | null
  onChange: (value: boolean | null) => void
  yes: string
  no: string
}) {
  return (
    <Segment
      label={label}
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
  const filled = answers.filter((value) => value !== null && value !== '').length
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
 */
export function PetFields({
  form,
  onChange,
}: {
  form: PetForm
  onChange: (patch: Partial<PetForm>) => void
}) {
  const t = useText()
  const hint = t.placeholders[form.species]
  const sex = form.species === 'dog' ? t.sexDog : t.sexCat
  const isDog = form.species === 'dog'

  const lifestyleAnswers = isDog
    ? [form.indoorOutdoor, form.diet, form.sizeClass, form.walkActivity]
    : [form.indoorOutdoor, form.diet]

  return (
    <>
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

      <Field
        label={t.petForm.name}
        value={form.name}
        onChangeText={(name) => onChange({ name })}
        placeholder={hint.name}
      />
      <Field
        label={t.petForm.breed}
        value={form.breed}
        onChangeText={(breed) => onChange({ breed })}
        placeholder={hint.breed}
      />
      <Field
        label={t.petForm.age(AGE_MAX)}
        value={form.ageYears}
        onChangeText={(ageYears) => onChange({ ageYears })}
        keyboardType="numeric"
      />
      <Field
        label={t.petForm.weight(WEIGHT_MAX)}
        value={form.weightKg}
        onChangeText={(weightKg) => onChange({ weightKg })}
        keyboardType="numeric"
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
        />
        <Field
          label={t.petForm.allergies}
          value={form.allergies}
          onChangeText={(allergies) => onChange({ allergies })}
          placeholder={t.petForm.allergiesHint}
          autoCapitalize="none"
        />
        <Field
          label={t.petForm.chronic}
          value={form.chronicConditions}
          onChangeText={(chronicConditions) => onChange({ chronicConditions })}
          placeholder={hint.chronic}
        />
        <Field
          label={t.petForm.medications}
          value={form.medications}
          onChangeText={(medications) => onChange({ medications })}
          placeholder={hint.medications}
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
          value={form.notes}
          onChangeText={(notes) => onChange({ notes })}
          multiline
        />
      </Accordion>
    </>
  )
}
