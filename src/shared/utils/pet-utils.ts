import type { PetSpecies } from '@/shared/types'

function toNumber(val: unknown): number | null {
  if (val == null || val === '') return null
  const raw = typeof val === 'string' ? val.trim().replace(',', '.') : val
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function toStringArray(val: unknown, maxItems = 20, maxItemLen = 150): string[] {
  if (!Array.isArray(val)) return []
  return val
    .slice(0, maxItems)
    .map(s => String(s ?? '').slice(0, maxItemLen).trim())
    .filter(Boolean)
}

export function sanitizeSpecies(val: unknown): PetSpecies {
  return val === 'dog' ? 'dog' : 'cat'
}

export function defaultPetName(species: PetSpecies): string {
  return species === 'dog' ? 'Пёс' : 'Кот'
}

export function sanitizePet(body: Record<string, unknown>) {
  const species = sanitizeSpecies(body.species)
  return {
    species,
    name: String(body.name ?? '').slice(0, 100).trim() || defaultPetName(species),
    breed: body.breed ? String(body.breed).slice(0, 100).trim() || null : null,
    age_years: toNumber(body.age_years),
    weight_kg: toNumber(body.weight_kg),
    sex: ['male', 'female'].includes(body.sex as string) ? (body.sex as 'male' | 'female') : null,
    neutered: body.neutered != null ? Boolean(body.neutered) : null,
    indoor_outdoor: ['indoor', 'outdoor', 'both'].includes(body.indoor_outdoor as string)
      ? (body.indoor_outdoor as 'indoor' | 'outdoor' | 'both')
      : null,
    diet: ['dry', 'wet', 'mixed', 'raw'].includes(body.diet as string)
      ? (body.diet as 'dry' | 'wet' | 'mixed' | 'raw')
      : null,
    allergies: toStringArray(body.allergies),
    vaccinated: body.vaccinated != null ? Boolean(body.vaccinated) : null,
    chronic_conditions: toStringArray(body.chronic_conditions),
    medications: toStringArray(body.medications),
    notes: body.notes ? String(body.notes).slice(0, 300).trim() || null : null,
  }
}

/** @deprecated Use sanitizePet */
export const sanitizeCat = sanitizePet
