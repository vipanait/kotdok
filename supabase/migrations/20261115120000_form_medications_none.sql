-- «Нет» is not a medicine.
--
-- The pet form's medicines field is a comma-separated list, and every entry
-- starts a course (MR-06). Owners who give nothing type «Нет», so the record
-- and the vet summary showed a current course called «Нет»: 10 of the 13 form
-- courses in production on 2026-11-15. The server now reads such an answer as
-- an empty list (`isNoneAnswer` in apps/web/src/shared/utils/pet-utils.ts);
-- this removes the courses made before. The list below is that one's.
--
-- Only courses nobody has touched: still from the form (an edit makes it the
-- owner's, source = 'record'), no dosage, no reminders, no dose marked. Only
-- active accounts and live pets: the late-write guard refuses the rest, and
-- an account being deleted is leaving anyway. Each affected pet's list is then
-- set from its courses again, so the form stops showing «Нет» too.
--
-- Soft delete, like «Удалить» in the record. Running it again finds nothing.

do $$
declare
  v_pet uuid;
begin
  create temporary table none_course_pets (pet_id uuid) on commit drop;

  with removed as (
    update public.pet_medications m
       set deleted_at = now()
      from public.pets p, public.profiles pr
     where p.id = m.pet_id and p.deleted_at is null
       and pr.id = m.user_id and pr.status = 'active'
       and m.deleted_at is null
       and m.source = 'form'
       and m.dosage is null
       and cardinality(m.reminder_times) = 0
       and not exists (select 1 from public.medication_doses d where d.medication_id = m.id)
       and btrim(regexp_replace(translate(lower(btrim(m.name)), 'ё', 'е'), '[.!,;]+$', '')) in (
         'нет', 'нету', 'ничего', 'никаких', 'никакие', 'не принимает', 'не принимаем', 'не принимаю', 'отсутствуют',
         'no', 'none', 'nothing', 'n/a', 'na', '-', '—', '–'
       )
    returning m.pet_id
  )
  insert into none_course_pets select distinct pet_id from removed;

  -- A statement of its own, so the list is set from courses already deleted.
  for v_pet in select pet_id from none_course_pets loop
    perform public.sync_pet_medications(v_pet, current_date);
  end loop;

  raise notice 'form «none» courses removed for % pet(s)', (select count(*) from none_course_pets);
  drop table none_course_pets;
end;
$$;
