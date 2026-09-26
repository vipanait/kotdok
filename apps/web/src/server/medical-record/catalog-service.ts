import 'server-only'

import { HealthProductSchema, type HealthProduct, type PetSpecies } from '@lapka/contracts'
import { matchesCatalog } from '@lapka/shared'
import type { createServiceClient } from '@/server/supabase/server'
import type { WeightResult } from './weight-service'

type SupabaseService = ReturnType<typeof createServiceClient>

type ProductRow = {
  id: string
  kind: HealthProduct['kind']
  name: string
  manufacturer: string | null
  aliases: string[] | null
  species: HealthProduct['species']
  form: string | null
  targets: string[]
  interval_value: number | null
  interval_unit: 'day' | 'week' | 'month' | 'year' | null
  popularity: number | null
}

/** The most a catalogue answer holds: the whole list for one species is well under it. */
const CATALOG_LIMIT = 200

/**
 * Whether owners may see products no vet has checked yet. Only test and
 * local stacks set it: the draft list from the spec is not advice (§5.4).
 */
function includeUnverified(): boolean {
  return process.env.HEALTH_CATALOG_INCLUDE_UNVERIFIED === '1'
}

function toProductContract(row: ProductRow): HealthProduct {
  return HealthProductSchema.parse({
    id: row.id,
    kind: row.kind,
    name: row.name,
    manufacturer: row.manufacturer,
    aliases: row.aliases ?? [],
    species: row.species,
    form: row.form,
    targets: row.targets,
    interval: row.interval_value && row.interval_unit ? { value: row.interval_value, unit: row.interval_unit } : null,
    popular: row.popularity !== null,
  })
}

/**
 * Products for one species and kind, popular first, filtered by a query the
 * way the phone filters it: case, «ё» and keyboard layout do not matter.
 */
export async function listCatalog(
  supabase: SupabaseService,
  species: PetSpecies,
  kind: HealthProduct['kind'],
  query: string,
): Promise<WeightResult<HealthProduct[]>> {
  let request = supabase
    .from('health_products')
    .select('id, kind, name, manufacturer, aliases, species, form, targets, interval_value, interval_unit, popularity')
    .eq('kind', kind)
    .eq('active', true)
    .contains('species', [species])
    .order('popularity', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })
    .limit(CATALOG_LIMIT)
  if (!includeUnverified()) request = request.eq('verified', true)

  const { data, error } = await request
  if (error) return { ok: false, reason: 'storage_error', message: error.message }

  return {
    ok: true,
    data: (data as ProductRow[])
      .filter((row) => matchesCatalog({ name: row.name, manufacturer: row.manufacturer, aliases: row.aliases ?? [] }, query))
      .map(toProductContract),
  }
}

/**
 * Whether every product named in a record may be used for this pet: it
 * exists, is shown to owners, is of the record's kind and covers the pet's
 * species. A forged product_id for a dog vaccine on a cat fails here
 * (MR-04.1); the item keeps its own copy of the name either way.
 */
export async function productsFitPet(
  supabase: SupabaseService,
  productIds: readonly string[],
  species: PetSpecies,
  kind: HealthProduct['kind'],
): Promise<WeightResult<boolean>> {
  const wanted = [...new Set(productIds)]
  if (wanted.length === 0) return { ok: true, data: true }

  let request = supabase
    .from('health_products')
    .select('id')
    .in('id', wanted)
    .eq('kind', kind)
    .eq('active', true)
    .contains('species', [species])
  if (!includeUnverified()) request = request.eq('verified', true)

  const { data, error } = await request
  if (error) return { ok: false, reason: 'storage_error', message: error.message }
  return { ok: true, data: (data ?? []).length === wanted.length }
}
