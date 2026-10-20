# FB-5: напоминания о приёме лекарств — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** У курса лекарства есть время приёма; телефон напоминает о нём каждый день, пока курс идёт, а на карточке питомца приём можно отметить «дали».

**Architecture:** Время приёма — колонка курса (`reminder_times`), журнал приёмов — новая таблица `medication_doses`; оба на сервере, чтобы пережить переустановку и работать на втором телефоне. Уведомления — локальные (`expo-notifications`), разовыми триггерами на ближайшие 7 дней: так отмеченный приём снимается, а закончившийся курс перестаёт напоминать. Пересчёт — тот же `ReminderSync`, что и для сроков, с приоритетом лекарств в лимите iOS. Ветка — поверх FB-4.

**Tech Stack:** Supabase Postgres, Next.js API, Zod, Expo (`expo-notifications`), Vitest.

**Spec:** [mobile-api-plan.md → «Этап FB-5»](../../mobile-api-plan.md#этап-fb-5-напоминания-о-приёме-лекарств). Решение владельца 20 октября 2026: меняет спеку медкарты §7.12, с отметкой «дали».

## Global Constraints

- Приложение не советует дозу и время: только то, что ввёл владелец. Тексты без тревожных слов («пропущено», не «опасно»).
- До 4 времён на курс, формат «ЧЧ:ММ», время — местное время телефона.
- Уведомления: не больше 64 запланированных (iOS); сначала лекарства на 7 дней, остаток — сроки, как сейчас.
- `MedicationSchema` в чтении не строгая: новое поле `reminder_times` с умолчанием `[]`; входные схемы строгие, поле необязательное.
- Комментарий `medications.ts:9` («No schedules and no reminders») и спеку §7.12 обновить.

## Review Focus

1. **Отметка «дали» дважды** (двойное нажатие, два телефона) — одна запись, второй ответ тот же. Тест — Task 2.
2. **Курс закончился вчера** — сегодня ни уведомлений, ни строки в «Сегодня». Тест — Task 3.
3. **Смена часового пояса или перевод часов** — время остаётся «08:00 по телефону». Тест на `doseMoments` с двумя зонами — Task 3.
4. **Лимит 64 при многих курсах** — лекарства не вытесняются сроками; если лекарств больше лимита, ближайшие первыми. Тест — Task 3.
5. **Отметка без сети** — ошибка видна, галочка не остаётся поставленной. Проверка вручную — Task 5.

---

### Task 1: Время приёма у курса

**Files:** migration `supabase/migrations/20261020140000_medication_times.sql`; `packages/contracts/src/medical-record.ts`; `apps/web/src/server/medical-record/medication-service.ts` (или где пишутся курсы); `apps/mobile/src/features/medical-record/medications.ts`, `app/(tabs)/pets/[id]/medication-form.tsx`, i18n; тесты контракта и `medications.test.ts`.

**Interfaces:** `pet_medications.reminder_times text[] not null default '{}'` с проверкой формата; `MedicationSchema.reminder_times: string[]` (default `[]`); `MedicationInputSchema`/`MedicationPatchSchema` + `reminder_times?: string[]` (0–4, `^([01]\d|2[0-3]):[0-5]\d$`, без повторов). Форма: «Напоминать» — чипы «08:00», «20:00» и «Своё время» (выбор часа и минут).

- [ ] Тесты контракта (формат, лимит, повтор) и формы (черновик ↔ запрос) → FAIL → реализация → PASS, коммит.

### Task 2: Журнал приёмов

**Files:** migration `20261021120000_medication_doses.sql`; contracts; `apps/web/src/server/medical-record/dose-service.ts`; маршруты `api/v1/pets/[id]/health/medications/[medicationId]/doses/route.ts` и `api/v1/pets/[id]/health/doses/route.ts`; api-client; `apps/web/tests/integration/feedback-05.test.ts`.

**Interfaces:**
- Таблица `medication_doses(id, user_id, pet_id, medication_id → pet_medications on delete cascade, taken_on date, slot text, created_at)`, unique `(medication_id, taken_on, slot)`, RLS без политик; удаление аккаунта — по `user_id` в `delete_account_data`.
- `POST …/medications/:mid/doses { taken_on, slot }` → 201 или 200 с той же записью; `DELETE …/medications/:mid/doses?taken_on&slot` → 204; `GET …/health/doses?from&to` → `MedicationDose[]` (период до 31 дня).
- `MedicationDoseSchema { medication_id, taken_on, slot }`.

- [ ] Тесты: отметка, повтор (Review Focus 1), отмена, чужой курс 404, `slot` не из `reminder_times` курса — 400, `taken_on` в будущем — 400, удаление курса удаляет журнал → FAIL → реализация → PASS, коммит.

### Task 3: План уведомлений

**Files:** `apps/mobile/src/features/medical-record/reminders/doses.ts` (+ тест), `schedule.ts`, `sync.ts`, `ReminderProvider.tsx`, i18n.

**Interfaces:**
- `doseMoments(courses: Medication[], doses: MedicationDose[], from: Date, days = 7): Array<{ medicationId; petId; day; slot; at: Date }>` — только идущие в этот день курсы (`isTakenNow` на каждый день), без уже отмеченных.
- `planReminders` получает `doseReminders` и бюджет: `REMINDER_LIMIT − doseReminders.length` для сроков. Идентификатор — `lapka-dose-${medicationId}-${day}-${slot}`. Текст: «Мурке: Нефростоп, 1 таблетка» (падеж через `nameCase`, иначе «Мурка — Нефростоп…»).
- `refresh()` дополнительно читает курсы и журнал на 7 дней по каждому питомцу.

- [ ] Тесты: закончившийся курс (Review Focus 2), отмеченный приём снят, два часовых пояса (Review Focus 3), лимит (Review Focus 4) → FAIL → реализация → PASS, коммит.

### Task 4: «Сегодня» на карточке питомца

**Files:** `apps/mobile/src/features/medical-record/TodayDoses.tsx`, `app/(tabs)/pets/[id]/index.tsx`, `reminders/sync.ts` (`openTarget` для `lapka-dose-*` → карточка питомца), i18n.

- [ ] Блок над «Сроками», если на сегодня есть приёмы: строка на время — «08:00 · Нефростоп, 1 таблетка» и кнопка «Дали» (36 dp, как «Отметить»); отмеченный — «Дали в 08:00» с отменой; прошедший неотмеченный — приглушённое «Не отмечено».
- [ ] Отметка — оптимистично, при ошибке откат и баннер (Review Focus 5); после отметки `reminders.refresh()`.
- [ ] tsc, тесты → коммит.

### Task 5: Симулятор, отчёт

- [ ] Курс с временем через 2 минуты → уведомление пришло; «Дали» → отметка видна после перезапуска; повторное уведомление не приходит; курс с `ended_on` вчера — нет блока.
- [ ] `docs/verification/feedback-05.md`, README, roadmap; обновить спеку медкарты §7.12 и комментарий в `medications.ts`. Коммит, финальное ревью отдельным агентом.
