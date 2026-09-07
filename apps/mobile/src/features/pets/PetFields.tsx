import { PET_DIETS, PET_LIFESTYLES, PET_SIZE_CLASSES, PET_WALK_ACTIVITIES } from '@lapka/contracts'
import { Choice, Field, Tristate } from '@/ui/Form'
import {
  dietLabels,
  lifestyleLabels,
  placeholders,
  sexLabels,
  sizeLabels,
  speciesLabels,
  walkLabels,
} from './labels'
import { AGE_MAX, WEIGHT_MAX, type PetForm } from './pet-form'

/**
 * The pet form itself, shared by the add and edit screens so the two cannot
 * drift apart — the same fields, the same wording, the same rules about which
 * of them a cat has.
 */
export function PetFields({
  form,
  onChange,
}: {
  form: PetForm
  onChange: (patch: Partial<PetForm>) => void
}) {
  const hint = placeholders(form.species)
  const sex = sexLabels(form.species)
  const isDog = form.species === 'dog'

  return (
    <>
      <Choice
        label="Вид"
        clearable={false}
        options={[
          { value: 'cat' as const, label: speciesLabels.cat },
          { value: 'dog' as const, label: speciesLabels.dog },
        ]}
        value={form.species}
        onChange={(species) => onChange({ species: species ?? 'cat' })}
      />

      <Field
        label="Имя *"
        value={form.name}
        onChangeText={(name) => onChange({ name })}
        placeholder={hint.name}
      />
      <Field
        label="Порода"
        value={form.breed}
        onChangeText={(breed) => onChange({ breed })}
        placeholder={hint.breed}
      />
      <Field
        label={`Возраст (лет), до ${AGE_MAX}`}
        value={form.ageYears}
        onChangeText={(ageYears) => onChange({ ageYears })}
        keyboardType="numeric"
      />
      <Field
        label={`Вес (кг), до ${WEIGHT_MAX}`}
        value={form.weightKg}
        onChangeText={(weightKg) => onChange({ weightKg })}
        keyboardType="numeric"
      />

      <Choice
        label="Пол"
        options={[
          { value: 'male' as const, label: sex.male },
          { value: 'female' as const, label: sex.female },
        ]}
        value={form.sex}
        onChange={(value) => onChange({ sex: value })}
      />
      <Tristate
        label="Стерилизован(а)/кастрирован(а)"
        value={form.neutered}
        onChange={(neutered) => onChange({ neutered })}
      />
      <Choice
        label="Содержание"
        options={PET_LIFESTYLES.map((value) => ({ value, label: lifestyleLabels[value] }))}
        value={form.indoorOutdoor}
        onChange={(indoorOutdoor) => onChange({ indoorOutdoor })}
      />
      <Choice
        label="Питание"
        options={PET_DIETS.map((value) => ({ value, label: dietLabels[value] }))}
        value={form.diet}
        onChange={(diet) => onChange({ diet })}
      />

      {/* Size and walking are asked of dogs only; the contract refuses them on a cat. */}
      {isDog ? (
        <>
          <Choice
            label="Размер"
            options={PET_SIZE_CLASSES.map((value) => ({ value, label: sizeLabels[value] }))}
            value={form.sizeClass}
            onChange={(sizeClass) => onChange({ sizeClass })}
          />
          <Choice
            label="Выгул"
            options={PET_WALK_ACTIVITIES.map((value) => ({ value, label: walkLabels[value] }))}
            value={form.walkActivity}
            onChange={(walkActivity) => onChange({ walkActivity })}
          />
        </>
      ) : null}

      <Tristate
        label="Вакцинация"
        value={form.vaccinated}
        onChange={(vaccinated) => onChange({ vaccinated })}
        yes="Привит(а)"
        no="Нет"
      />
      <Field
        label="Аллергии"
        value={form.allergies}
        onChangeText={(allergies) => onChange({ allergies })}
        placeholder="курица, рыба — через запятую"
        autoCapitalize="none"
      />
      <Field
        label="Хронические болезни"
        value={form.chronicConditions}
        onChangeText={(chronicConditions) => onChange({ chronicConditions })}
        placeholder={hint.chronic}
      />
      <Field
        label="Принимает препараты"
        value={form.medications}
        onChangeText={(medications) => onChange({ medications })}
        placeholder={hint.medications}
      />
      <Field
        label="Заметки"
        value={form.notes}
        onChangeText={(notes) => onChange({ notes })}
        multiline
      />
    </>
  )
}
