import type { PetSpecies } from '@/shared/types'
import type { SymptomCheckRecord } from '@/features/symptom-check/CheckResultContent'

const CHECK_SELECT = `
  id,
  symptoms_input,
  urgency,
  urgency_reason,
  possible_causes,
  species_specific_warning,
  home_care_steps,
  vet_questions,
  full_response,
  created_at,
  pet_id,
  pets ( name, species )
`

type PetJoin = { name: string | null; species: string | null } | null

type CheckRow = {
  id: string
  symptoms_input: string
  urgency: string
  urgency_reason: string
  possible_causes: unknown
  species_specific_warning: string | null
  home_care_steps: unknown
  vet_questions: unknown
  full_response: Record<string, unknown> | null
  created_at: string
  pet_id: string | null
  pets?: PetJoin | PetJoin[]
}

function pickPet(pets: CheckRow['pets']): PetJoin {
  if (!pets) return null
  return Array.isArray(pets) ? pets[0] ?? null : pets
}

export function symptomCheckSelect() {
  return CHECK_SELECT
}

export function mapSymptomCheckRow(row: CheckRow): SymptomCheckRecord {
  const pet = pickPet(row.pets)
  const species = pet?.species === 'dog' || pet?.species === 'cat'
    ? pet.species as PetSpecies
    : null

  return {
    id: row.id,
    symptoms_input: row.symptoms_input,
    urgency: row.urgency,
    urgency_reason: row.urgency_reason,
    possible_causes: row.possible_causes,
    species_specific_warning: row.species_specific_warning,
    home_care_steps: row.home_care_steps,
    vet_questions: row.vet_questions,
    full_response: row.full_response,
    created_at: row.created_at,
    pet_id: row.pet_id,
    pet_name: pet?.name ?? null,
    pet_species: species,
  }
}
