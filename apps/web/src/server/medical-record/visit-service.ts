import 'server-only'

import type { HealthEvent, VisitInput, VisitPatch } from '@lapka/contracts'
import type { createServiceClient } from '@/server/supabase/server'
import { readEvent } from './event-service'
import { utcToday, type WeightResult } from './weight-service'

type SupabaseService = ReturnType<typeof createServiceClient>
type Result<T> = WeightResult<T> | { ok: false; reason: 'bad_check'; message?: string }

function failure(error: { code?: string; message: string }): { ok: false; reason: 'not_found' | 'conflict' | 'storage_error'; message: string } {
  if (error.code === 'P0002') return { ok: false, reason: 'not_found', message: error.message }
  if (error.code === '23505') return { ok: false, reason: 'conflict', message: error.message }
  return { ok: false, reason: 'storage_error', message: error.message }
}

/**
 * A check may be linked only if it is the caller's own, of this pet, and not
 * deleted (MR-07.2). A check_id the database would accept for any pet is
 * refused here.
 */
async function checkFits(supabase: SupabaseService, userId: string, petId: string, checkId: string): Promise<boolean> {
  const { data } = await supabase
    .from('symptom_checks')
    .select('id')
    .eq('id', checkId)
    .eq('user_id', userId)
    .eq('pet_id', petId)
    .is('deleted_at', null)
    .maybeSingle()
  return data !== null
}

function prescriptions(items: VisitInput['prescriptions']) {
  return (items ?? []).map((item) => ({
    ...(item.id ? { id: item.id } : {}),
    name: item.name,
    instructions: item.instructions ?? null,
    add_to_medications: item.add_to_medications ?? false,
    targets: [],
  }))
}

export async function createVisit(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  input: VisitInput,
  idempotencyKey: string | null,
  today: string = utcToday(),
): Promise<Result<HealthEvent>> {
  if (input.check_id && !(await checkFits(supabase, userId, petId, input.check_id))) {
    return { ok: false, reason: 'bad_check' }
  }

  const { data, error } = await supabase.rpc('create_visit', {
    p_user_id: userId,
    p_pet_id: petId,
    p_status: input.status,
    p_date: input.date,
    p_clinic: input.clinic ?? null,
    p_notes: input.notes ?? null,
    p_visit: {
      visit_kind: input.visit_kind,
      reason: input.reason ?? null,
      diagnosis: input.diagnosis ?? null,
      check_id: input.check_id ?? null,
    },
    p_items: prescriptions(input.prescriptions),
    p_today: today,
    p_key: idempotencyKey,
  })
  if (error) return failure(error)
  return readEvent(supabase, userId, petId, data as string)
}

/**
 * A correction, or «Был» on a plan. The check is verified only when it
 * changes: a link made while the check was recent stays after 30 days.
 */
export async function updateVisit(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  eventId: string,
  patch: VisitPatch,
  current: HealthEvent,
  today: string = utcToday(),
): Promise<Result<HealthEvent>> {
  if (patch.check_id && patch.check_id !== current.check_id && !(await checkFits(supabase, userId, petId, patch.check_id))) {
    return { ok: false, reason: 'bad_check' }
  }

  const { prescriptions: items, ...changes } = patch
  const { error } = await supabase.rpc('update_visit', {
    p_user_id: userId,
    p_pet_id: petId,
    p_event_id: eventId,
    p_changes: changes,
    p_items: items === undefined ? null : prescriptions(items),
    p_today: today,
  })
  if (error) return failure(error)
  return readEvent(supabase, userId, petId, eventId)
}

/** «Добавить в лекарства» on a prescription the visit already has. Once. */
export async function prescriptionToMedication(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  itemId: string,
  today: string = utcToday(),
): Promise<WeightResult<string>> {
  const { data, error } = await supabase.rpc('course_from_prescription', {
    p_user_id: userId,
    p_pet_id: petId,
    p_item_id: itemId,
    p_today: today,
  })
  if (error) return failure(error)
  return { ok: true, data: data as string }
}
