import 'server-only'

import type { PetSpecies, SafetyIndex, SafetyItem, SafetySpeciesSection } from '@lapka/contracts'
import { petSafetyNotes } from '@lapka/shared'
import type { createServiceClient } from '@/server/supabase/server'
import { entryBySlug, safetyIndex } from '@/features/safety/load'
import type { SafetyEntry } from '@/features/safety/schema'
import type { Locale } from '@/shared/i18n/config'

type SupabaseService = ReturnType<typeof createServiceClient>

/**
 * The «Можно ли» reference for the v1 API (docs/superpowers/specs/2026-11-13-pet-safety-design.md, «API»).
 * Entries come from the files the loader reads, with its visibility rule:
 * production serves published entries only. The database is read only for
 * the pet a card is made for.
 */

export function getSafetyIndex(locale: Locale): SafetyIndex {
  return { items: safetyIndex(locale) }
}

type PetRow = { species: PetSpecies; allergies: string[] | null; chronic_conditions: string[] | null }

function section(entry: SafetyEntry, species: PetSpecies, locale: Locale): SafetySpeciesSection {
  const s = entry.bySpecies[species]
  return { verdict: s.verdict, summary: s.summary[locale], why: s.why[locale], signs: s.signs[locale], if_eaten: s.ifEaten }
}

export async function getSafetyItem(
  supabase: SupabaseService,
  input: { userId: string; slug: string; petId: string | null; locale: Locale },
): Promise<{ ok: true; data: SafetyItem } | { ok: false; reason: 'not_found' | 'storage_error' }> {
  const entry = entryBySlug(input.slug)
  if (!entry) return { ok: false, reason: 'not_found' }

  let pet: (PetRow & { id: string }) | null = null
  if (input.petId) {
    const { data, error } = await supabase
      .from('pets')
      .select('species, allergies, chronic_conditions')
      .eq('id', input.petId)
      .eq('user_id', input.userId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) return { ok: false, reason: 'storage_error' }
    // Someone else's pet is indistinguishable from one that never existed, and its notes are never read.
    if (!data) return { ok: false, reason: 'not_found' }
    pet = { id: input.petId, ...(data as PetRow) }
  }

  const species: PetSpecies[] = pet?.species === 'cat' || !pet ? ['cat', 'dog'] : ['dog', 'cat']
  const other: Locale = input.locale === 'ru' ? 'en' : 'ru'

  return {
    ok: true,
    data: {
      slug: entry.slug,
      category: entry.category,
      name: entry.name[input.locale],
      // The pet's species first: the card opens on its section.
      by_species: Object.fromEntries(species.map(s => [s, section(entry, s, input.locale)])) as SafetyItem['by_species'],
      first_steps: entry.firstSteps[input.locale],
      avoid: entry.avoid[input.locale],
      toxin_slug: entry.toxinSlug ?? null,
      sources: entry.sources.map(source => (source.url ? { title: source.title, url: source.url } : { title: source.title })),
      pet: pet && { id: pet.id, species: pet.species },
      pet_notes: pet
        ? petSafetyNotes(
            { allergies: pet.allergies ?? [], chronic_conditions: pet.chronic_conditions ?? [] },
            // Both languages: an allergy is matched in whatever language the owner typed it.
            {
              name: entry.name[input.locale],
              aliases: [...entry.aliases[input.locale], entry.name[other], ...entry.aliases[other]],
            },
            entry.bySpecies[pet.species].verdict,
          )
        : [],
    },
  }
}
