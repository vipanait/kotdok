-- Indexes for the medical record's foreign keys (final review).
--
-- Deleting an account deletes its checks and pets row by row; every deleted
-- row cascades to, or clears a link in, these tables. The existing pet_id
-- indexes are partial (`deleted_at is null`), which the cascade's lookup
-- cannot use, and three links had none: each deletion scanned the tables of
-- every user. A partial `is not null` index does serve `col = $1`.

create index if not exists pet_weights_pet_fk_idx on public.pet_weights (pet_id);
create index if not exists pet_health_events_pet_fk_idx on public.pet_health_events (pet_id);
create index if not exists pet_health_items_pet_fk_idx on public.pet_health_items (pet_id);
create index if not exists pet_medications_pet_fk_idx on public.pet_medications (pet_id);

create index if not exists pet_health_events_check_fk_idx
  on public.pet_health_events (check_id) where check_id is not null;
create index if not exists pet_health_items_source_item_fk_idx
  on public.pet_health_items (source_item_id) where source_item_id is not null;
create index if not exists pet_medications_visit_item_fk_idx
  on public.pet_medications (visit_item_id) where visit_item_id is not null;
