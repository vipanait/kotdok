import 'server-only'

import {
  DueItemSchema,
  HealthEventSchema,
  type CompleteItemInput,
  type DueItem,
  type HealthEvent,
  type HealthEventInput,
  type HealthEventPatch,
} from '@lapka/contracts'
import type { createServiceClient } from '@/server/supabase/server'
import type { WeightResult } from './weight-service'
import { productsFitPet } from './catalog-service'
import { getPet } from '@/server/pets/pet-service'

type SupabaseService = ReturnType<typeof createServiceClient>
type Result<T> = WeightResult<T>

type ItemRow = {
  id: string
  name: string | null
  targets: string[] | null
  source_item_id: string | null
  product_id: string | null
  position: number
  deleted_at: string | null
}

type EventRow = {
  id: string
  kind: HealthEvent['kind']
  status: HealthEvent['status']
  event_date: string
  clinic: string | null
  notes: string | null
  pet_health_items: ItemRow[]
}

const EVENT_COLUMNS =
  'id, kind, status, event_date, clinic, notes, pet_health_items(id, name, targets, source_item_id, product_id, position, deleted_at)'

/** Field by field: owner, keys and deletion marks stay on the server. */
function toEventContract(row: EventRow): HealthEvent {
  const items = row.pet_health_items
    .filter((item) => item.deleted_at === null)
    .sort((a, b) => a.position - b.position)
  return HealthEventSchema.parse({
    id: row.id,
    kind: row.kind,
    status: row.status,
    date: row.event_date,
    clinic: row.clinic,
    notes: row.notes,
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      targets: item.targets ?? [],
      source_item_id: item.source_item_id,
      product_id: item.product_id,
    })),
  })
}

function failure(error: { code?: string; message: string }): { ok: false; reason: 'not_found' | 'conflict' | 'storage_error'; message: string } {
  if (error.code === 'P0002') return { ok: false, reason: 'not_found', message: error.message }
  if (error.code === '23505') return { ok: false, reason: 'conflict', message: error.message }
  return { ok: false, reason: 'storage_error', message: error.message }
}

/** A pet's live records with their live items, newest day first. */
export async function listEvents(supabase: SupabaseService, petId: string): Promise<Result<HealthEvent[]>> {
  const { data, error } = await supabase
    .from('pet_health_events')
    .select(EVENT_COLUMNS)
    .eq('pet_id', petId)
    .is('deleted_at', null)
    .order('event_date', { ascending: false })
    .limit(500)

  if (error) return { ok: false, reason: 'storage_error', message: error.message }
  return {
    ok: true,
    data: (data as unknown as EventRow[]).map(toEventContract).filter((event) => event.items.length > 0),
  }
}

async function readEvent(supabase: SupabaseService, userId: string, petId: string, eventId: string): Promise<Result<HealthEvent>> {
  const { data, error } = await supabase
    .from('pet_health_events')
    .select(EVENT_COLUMNS)
    .eq('id', eventId)
    .eq('pet_id', petId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) return { ok: false, reason: 'storage_error', message: error.message }
  if (!data) return { ok: false, reason: 'not_found' }
  return { ok: true, data: toEventContract(data as unknown as EventRow) }
}

/** The status and day of one of the caller's records, for the route's date rules. */
export async function eventStatus(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  eventId: string,
): Promise<Result<{ status: HealthEvent['status'] }>> {
  const event = await readEvent(supabase, userId, petId, eventId)
  return event.ok ? { ok: true, data: { status: event.data.status } } : event
}

/** Products named in a record must fit the pet; `bad_product` becomes a 400. */
async function checkProducts(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  productIds: readonly (string | null | undefined)[],
): Promise<Result<null> | { ok: false; reason: 'bad_product' }> {
  const ids = productIds.filter((id): id is string => typeof id === 'string')
  if (ids.length === 0) return { ok: true, data: null }

  const pet = await getPet(supabase, userId, petId)
  if (!pet.ok) return { ok: false, reason: pet.reason === 'account_deleting' ? 'account_deleting' : pet.reason === 'not_found' ? 'not_found' : 'storage_error' }
  const fits = await productsFitPet(supabase, ids, pet.data.species, 'vaccine')
  if (!fits.ok) return fits
  return fits.data ? { ok: true, data: null } : { ok: false, reason: 'bad_product' }
}

export async function createEvent(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  input: HealthEventInput,
  idempotencyKey: string | null,
): Promise<Result<HealthEvent> | { ok: false; reason: 'bad_product' }> {
  const products = await checkProducts(supabase, userId, petId, input.items.map((item) => item.product_id))
  if (!products.ok) return products

  const { data, error } = await supabase.rpc('create_health_event', {
    p_user_id: userId,
    p_pet_id: petId,
    p_kind: input.kind,
    p_status: input.status,
    p_date: input.date,
    p_clinic: input.clinic ?? null,
    p_notes: input.notes ?? null,
    p_items: input.items.map((item) => ({
      name: item.name ?? null,
      targets: item.targets,
      product_id: item.product_id ?? null,
      next_on: input.status === 'done' ? (item.next_on ?? null) : null,
    })),
    p_key: idempotencyKey,
  })

  if (error) return failure(error)
  return readEvent(supabase, userId, petId, data as string)
}

export async function updateEvent(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  eventId: string,
  patch: HealthEventPatch,
): Promise<Result<HealthEvent> | { ok: false; reason: 'bad_product' }> {
  const products = await checkProducts(supabase, userId, petId, (patch.items ?? []).map((item) => item.product_id))
  if (!products.ok) return products

  const { error } = await supabase.rpc('update_health_event', {
    p_user_id: userId,
    p_pet_id: petId,
    p_event_id: eventId,
    p_date: patch.date ?? null,
    // `undefined` keeps the field; `null` or '' clears it. The function reads '' as "clear".
    p_clinic: patch.clinic === undefined ? null : (patch.clinic ?? ''),
    p_notes: patch.notes === undefined ? null : (patch.notes ?? ''),
    p_items: patch.items ?? null,
  })

  if (error) return failure(error)
  return readEvent(supabase, userId, petId, eventId)
}

export async function deleteEvent(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  eventId: string,
): Promise<Result<null>> {
  const { error } = await supabase.rpc('delete_health_event', {
    p_user_id: userId,
    p_pet_id: petId,
    p_event_id: eventId,
  })
  if (error) return failure(error)
  return { ok: true, data: null }
}

export async function completeItem(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  itemId: string,
  input: CompleteItemInput,
  idempotencyKey: string | null,
): Promise<Result<HealthEvent>> {
  const { data, error } = await supabase.rpc('complete_health_item', {
    p_user_id: userId,
    p_pet_id: petId,
    p_item_id: itemId,
    p_done_on: input.done_on,
    p_next_on: input.next_on ?? null,
    p_clinic: input.clinic ?? null,
    p_notes: input.notes ?? null,
    p_key: idempotencyKey,
  })

  if (error) return failure(error)
  return readEvent(supabase, userId, petId, data as string)
}

type DueRow = {
  id: string
  pet_id: string
  kind: DueItem['kind']
  event_date: string
  pet_health_items: ItemRow[]
  pets: { deleted_at: string | null } | null
}

/** Every planned item of the caller's live pets: the pet list shows the earliest per pet. */
export async function listDue(supabase: SupabaseService, userId: string): Promise<Result<DueItem[]>> {
  const { data, error } = await supabase
    .from('pet_health_events')
    .select('id, pet_id, kind, event_date, pet_health_items(id, name, targets, source_item_id, product_id, position, deleted_at), pets!inner(deleted_at)')
    .eq('user_id', userId)
    .eq('status', 'planned')
    .is('deleted_at', null)
    .is('pets.deleted_at', null)
    .order('event_date', { ascending: true })
    .limit(500)

  if (error) return { ok: false, reason: 'storage_error', message: error.message }
  return {
    ok: true,
    data: (data as unknown as DueRow[]).flatMap((event) =>
      event.pet_health_items
        .filter((item) => item.deleted_at === null)
        .sort((a, b) => a.position - b.position)
        .map((item) =>
          DueItemSchema.parse({
            pet_id: event.pet_id,
            event_id: event.id,
            item_id: item.id,
            kind: event.kind,
            date: event.event_date,
            name: item.name,
            targets: item.targets ?? [],
          }),
        ),
    ),
  }
}
