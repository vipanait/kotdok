import { describe, expect, it, vi } from 'vitest'
import ru from '@/shared/i18n/dictionaries/ru'
import PetForm from '@/features/pets/PetForm'
import { petFormRequest, type PetFormFields } from '@/features/pets/pet-form-request'
import type { Pet } from '@/shared/types'
import { render, tag } from './static-render'

// The pet form's fields and what «Сохранить» sends (spec §4, MW-08, MW-09):
// the medicines field shows the list the record holds on the owner's day,
// and an edit sends the list as the form opened with (`medications_before`),
// so a course added meanwhile on another device is not ended by this save.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))

const TODAY = '2026-09-27'
const t = ru.pets

const murka: Pet = {
  id: '11111111-1111-4111-8111-000000000001',
  user_id: '99999999-9999-4999-8999-000000000001',
  species: 'cat',
  name: 'Мурка',
  breed: 'Сибирская',
  age_years: 0,
  weight_kg: 4.25,
  sex: 'female',
  neutered: true,
  indoor_outdoor: 'indoor',
  diet: 'dry',
  size_class: null,
  walk_activity: null,
  allergies: ['Курица'],
  vaccinated: true,
  chronic_conditions: [],
  medications: ['Лечебный корм', 'Фортифлора'],
  notes: null,
  created_at: '2026-01-01T00:00:00.000Z',
}

/** The fields as the form opens with a pet, untouched. */
function untouched(pet: Pet): PetFormFields {
  return {
    species: pet.species,
    name: pet.name,
    breed: pet.breed ?? '',
    ageYears: pet.age_years?.toString() ?? '',
    weightKg: pet.weight_kg?.toString() ?? '',
    sex: pet.sex,
    neutered: pet.neutered,
    indoorOutdoor: pet.indoor_outdoor,
    diet: pet.diet,
    sizeClass: pet.size_class,
    walkActivity: pet.walk_activity,
    allergies: (pet.allergies ?? []).join(', '),
    vaccinated: pet.vaccinated,
    chronicConditions: (pet.chronic_conditions ?? []).join(', '),
    medications: (pet.medications ?? []).join(', '),
    notes: pet.notes ?? '',
  }
}

const medicationsField = (html: string) => tag(html, 'input', (input) => (input.attrs.id ?? '').endsWith('-medications'))

describe('the medicines field', () => {
  it('shows the list the record gave, comma-separated, with the note that the record says more', () => {
    const html = render(<PetForm pet={murka} hints={{ medications: t.recordHints.medications }} />)
    const field = medicationsField(html)
    expect(field.attrs.value).toBe('Лечебный корм, Фортифлора')
    expect(field.attrs['aria-describedby']).toBe(`${field.attrs.id}-hint`)
    expect(tag(html, 'span', (span) => span.attrs.id === `${field.attrs.id}-hint`).text).toBe(t.recordHints.medications)
    expect(tag(html, 'label', (label) => label.attrs.for === field.attrs.id).text).toContain(t.medications)
  })

  it('is empty for an older pet without a list, and without a note while the record says nothing more', () => {
    const older = { ...murka, medications: null } as unknown as Pet
    const field = medicationsField(render(<PetForm pet={older} />))
    expect(field.attrs.value).toBe('')
    expect(field.attrs['aria-describedby']).toBeUndefined()
  })

  it('keeps an age of 0 and a weight with two decimals as they are', () => {
    const html = render(<PetForm pet={murka} />)
    expect(tag(html, 'input', (input) => (input.attrs.id ?? '').endsWith('-age')).attrs.value).toBe('0')
    expect(tag(html, 'input', (input) => (input.attrs.id ?? '').endsWith('-weight')).attrs.value).toBe('4.25')
  })
})

describe('what «Сохранить» sends', () => {
  it('an edit: PUT with the list and weight as the form opened (`medications_before`, `weight_kg_before`) and the owner’s day', () => {
    const fields = { ...untouched(murka), medications: 'Лечебный корм,  , Фортифлора, Апоквел ' }
    expect(petFormRequest(murka, fields, TODAY)).toMatchObject({
      url: `/api/pets/${murka.id}`,
      method: 'PUT',
      body: {
        medications: ['Лечебный корм', 'Фортифлора', 'Апоквел'],
        medications_before: ['Лечебный корм', 'Фортифлора'],
        weight_kg: 4.25,
        weight_kg_before: 4.25,
        weight_measured_on: TODAY,
      },
    })
  })

  it('an older pet with no list sends the empty list the form showed, never null', () => {
    const older = { ...murka, medications: null } as unknown as Pet
    const request = petFormRequest(older, untouched(older), TODAY)
    expect(request.body.medications_before).toEqual([])
    expect(request.body.medications).toEqual([])
  })

  it('a new pet: POST, no «before» values — there was nothing before', () => {
    const request = petFormRequest(undefined, { ...untouched(murka), name: '  Барсик ', weightKg: '4,2', breed: ' ' }, TODAY)
    expect(request).toMatchObject({ url: '/api/pets', method: 'POST' })
    expect(request.body).toMatchObject({ name: 'Барсик', weight_kg: 4.2, breed: null, weight_measured_on: TODAY })
    expect('medications_before' in request.body).toBe(false)
    expect('weight_kg_before' in request.body).toBe(false)
  })

  it('sends a dog’s size and walks, never a cat’s', () => {
    const dog = { ...untouched(murka), species: 'dog' as const, sizeClass: 'small' as const, walkActivity: 'daily_short' as const }
    expect(petFormRequest(undefined, dog, TODAY).body).toMatchObject({ size_class: 'small', walk_activity: 'daily_short' })
    expect(petFormRequest(undefined, { ...dog, species: 'cat' }, TODAY).body).toMatchObject({ size_class: null, walk_activity: null })
  })
})
