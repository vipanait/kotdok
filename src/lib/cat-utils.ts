function toNumber(val: unknown): number | null {
  if (val == null || val === '') return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

export function sanitizeCat(body: Record<string, unknown>) {
  return {
    name: String(body.name ?? '').trim() || 'Кот',
    breed: body.breed ? String(body.breed).trim() || null : null,
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
    allergies: Array.isArray(body.allergies) ? (body.allergies as string[]) : [],
    vaccinated: body.vaccinated != null ? Boolean(body.vaccinated) : null,
    chronic_conditions: Array.isArray(body.chronic_conditions) ? (body.chronic_conditions as string[]) : [],
    medications: Array.isArray(body.medications) ? (body.medications as string[]) : [],
    notes: body.notes ? String(body.notes).slice(0, 300).trim() || null : null,
  }
}
