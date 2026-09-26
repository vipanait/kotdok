import 'server-only'

import {
  DueItemSchema,
  HealthEventSchema,
  ParasiteTargetSchema,
  VaccineTargetSchema,
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
  instructions: string | null
  pet_medications: Array<{ id: string; deleted_at: string | null }> | null
  name: string | null
  targets: string[] | null
  source_item_id: string | null
  product_id: string | null
  interval_value: number | null
  interval_unit: 'day' | 'week' | 'month' | 'year' | null
  position: number
  deleted_at: string | null
}

type EventRow = {
  id: string
  visit_kind: HealthEvent['visit_kind']
  reason: string | null
  diagnosis: string | null
  check_id: string | null
  kind: HealthEvent['kind']
  status: HealthEvent['status']
  event_date: string
  clinic: string | null
  notes: string | null
  pet_health_items: ItemRow[]
}

const ITEM_COLUMNS =
  'id, name, targets, source_item_id, product_id, interval_value, interval_unit, instructions, position, deleted_at, pet_medications(id, deleted_at)'

const EVENT_COLUMNS = `id, kind, status, event_date, clinic, notes, visit_kind, reason, diagnosis, check_id, pet_health_items(${ITEM_COLUMNS})`

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
      interval: item.interval_value && item.interval_unit ? { value: item.interval_value, unit: item.interval_unit } : null,
      instructions: item.instructions,
      medication_id: (item.pet_medications ?? []).find((course) => course.deleted_at === null)?.id ?? null,
    })),
    visit_kind: row.visit_kind,
    reason: row.reason,
    diagnosis: row.diagnosis,
    check_id: row.check_id,
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
    // Records of one day in a fixed order, so the same record reads the same way twice.
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(500)

  if (error) return { ok: false, reason: 'storage_error', message: error.message }
  return {
    ok: true,
    // A visit may have no items; other records without any are gone in all but name.
    data: (data as unknown as EventRow[])
      .map(toEventContract)
      .filter((event) => event.kind === 'visit' || event.items.length > 0),
  }
}

export async function readEvent(supabase: SupabaseService, userId: string, petId: string, eventId: string): Promise<Result<HealthEvent>> {
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

/** The catalogue kind a record's products must be: vaccines on vaccinations, treatments on treatments. */
const PRODUCT_KIND: Record<HealthEvent['kind'], 'vaccine' | 'antiparasitic' | null> = {
  vaccination: 'vaccine',
  parasite: 'antiparasitic',
  visit: null,
}

/** Products named in a record must fit the pet; `bad_product` becomes a 400. */
async function checkProducts(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  kind: HealthEvent['kind'],
  productIds: readonly (string | null | undefined)[],
): Promise<Result<null> | { ok: false; reason: 'bad_product' }> {
  const ids = productIds.filter((id): id is string => typeof id === 'string')
  if (ids.length === 0) return { ok: true, data: null }

  const pet = await getPet(supabase, userId, petId)
  if (!pet.ok) return { ok: false, reason: pet.reason === 'account_deleting' ? 'account_deleting' : pet.reason === 'not_found' ? 'not_found' : 'storage_error' }
  const productKind = PRODUCT_KIND[kind]
  if (!productKind) return { ok: false, reason: 'bad_product' }
  const fits = await productsFitPet(supabase, ids, pet.data.species, productKind)
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
  const products = await checkProducts(supabase, userId, petId, input.kind, input.items.map((item) => item.product_id))
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

/** Why a record may not be changed; the route answers it with `record_done` (409). */
export type DoneRecord = { ok: false; reason: 'record_done' }

/**
 * The owner's rule of 26 September 2026: a procedure that was done — a
 * vaccination, a treatment, and (MW-06) a visit that happened — is history.
 * It can be read and deleted, never changed. A plan changes freely, keeps its
 * id and items, and becomes done only through its own step: «Сделано»
 * (`complete_health_item`) for an item, «Был» for a visit (a PATCH that
 * starts from a plan, so it passes here).
 *
 * The one check every change of a record goes through: `updateEvent` here,
 * and the visit PATCH once MW-06 routes it through this too. Deleting does
 * not ask it. Weights and the pet form are not procedures and never do.
 *
 * Read-then-write, not inside the SQL function: a «Сделано» landing between
 * the read and the write of a change to the same plan is not caught (see the
 * MW-03 report); every ordinary path is.
 */
export function refuseDoneChange(current: Pick<HealthEvent, 'status'>): DoneRecord | null {
  return current.status === 'done' ? { ok: false, reason: 'record_done' } : null
}

/**
 * A correction of a plan: its day («Перенести»), clinic, note and items. A
 * done record is refused before anything else is looked at.
 */
export async function updateEvent(
  supabase: SupabaseService,
  userId: string,
  petId: string,
  eventId: string,
  patch: HealthEventPatch,
): Promise<Result<HealthEvent> | DoneRecord | { ok: false; reason: 'bad_product' | 'bad_target' }> {
  // Only a product newly given to an item is checked: one the item already
  // had may have left the catalogue since, and correcting the note of a plan
  // must not fail for it.
  // Visits are corrected through /visits, which knows their fields.
  const current = await readEvent(supabase, userId, petId, eventId)
  if (!current.ok) return current
  if (current.data.kind === 'visit') return { ok: false, reason: 'not_found' }
  const done = refuseDoneChange(current.data)
  if (done) return done

  if (patch.items) {

    // The patch carries no kind: the record's own says which targets fit.
    const fits = current.data.kind === 'vaccination' ? VaccineTargetSchema : ParasiteTargetSchema
    if (patch.items.some((item) => item.targets.some((target) => !fits.safeParse(target).success))) {
      return { ok: false, reason: 'bad_target' }
    }

    const had = new Map(current.data.items.map((item) => [item.id, item.product_id]))
    const changed = patch.items
      .filter((item) => !item.id || had.get(item.id) !== (item.product_id ?? null))
      .map((item) => item.product_id)
    const products = await checkProducts(supabase, userId, petId, current.data.kind, changed)
    if (!products.ok) return products
  }

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

/**
 * Every planned item of the caller's live pets, overdue first, then the
 * soonest: the pet list shows the earliest per pet. The same order as
 * `dueEntries` (packages/shared) gives the record and «Все сроки».
 */
export async function listDue(supabase: SupabaseService, userId: string): Promise<Result<DueItem[]>> {
  const { data, error } = await supabase
    .from('pet_health_events')
    .select('id, pet_id, kind, event_date, pet_health_items(id, name, targets, source_item_id, product_id, interval_value, interval_unit, position, deleted_at), pets!inner(deleted_at)')
    .eq('user_id', userId)
    .eq('status', 'planned')
    .is('deleted_at', null)
    .is('pets.deleted_at', null)
    .order('event_date', { ascending: true })
    // Plans of one day in the overview's order (newest first), so the pet list,
    // the record and «Все сроки» list the same day's dates the same way
    // (the shared `dueEntries` keeps the overview's order on a tie).
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(500)

  if (error) return { ok: false, reason: 'storage_error', message: error.message }
  return {
    ok: true,
    data: (data as unknown as DueRow[]).flatMap((event) =>
      // A planned visit is one due date of its own, with no items: its id stands for the item.
      event.kind === 'visit'
        ? [DueItemSchema.parse({ pet_id: event.pet_id, event_id: event.id, item_id: event.id, kind: 'visit', date: event.event_date, name: null, targets: [] })]
        : event.pet_health_items
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
