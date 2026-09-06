import {
  PetSpeciesSchema,
  UrgencySchema,
  type PetSpecies,
  type SymptomCheckRecord,
  type Urgency,
} from '@lapka/contracts'

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

// The columns are nullable text[]; the renderer has always treated anything
// else as an empty list, so normalise here instead of at every call site.
function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : []
}

function toSpecies(value: string | null | undefined): PetSpecies | null {
  const parsed = PetSpeciesSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

// A row written before a urgency value was added would otherwise reach the UI
// as an unknown key and render with fallback styling and no label.
function toUrgency(value: string): Urgency {
  const parsed = UrgencySchema.safeParse(value)
  return parsed.success ? parsed.data : 'monitor'
}

export function symptomCheckSelect() {
  return CHECK_SELECT
}

export function mapSymptomCheckRow(row: CheckRow): SymptomCheckRecord {
  const pet = pickPet(row.pets)

  return {
    id: row.id,
    symptoms_input: row.symptoms_input,
    urgency: toUrgency(row.urgency),
    urgency_reason: row.urgency_reason,
    possible_causes: toStringArray(row.possible_causes),
    species_specific_warning: row.species_specific_warning,
    home_care_steps: toStringArray(row.home_care_steps),
    vet_questions: toStringArray(row.vet_questions),
    full_response: row.full_response,
    created_at: row.created_at,
    pet_id: row.pet_id,
    pet_name: pet?.name ?? null,
    pet_species: toSpecies(pet?.species),
  }
}
