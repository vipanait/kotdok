# FB-2: анкета и памятные даты — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** У питомца есть дата рождения (точная или примерная) и день появления в семье; карточка считает «вместе N дней» и поздравляет с днём рождения; после создания питомца приложение спрашивает про прививки и последний визит к врачу.

**Architecture:** Три новые колонки `pets` и поля контракта. Возраст везде считается одной общей функцией `petAgeYears` из `packages/shared`. Новый экран «Первые шаги» (`pets/[id]/first-steps.tsx`) создаёт записи медкарты через существующие эндпоинты событий и визитов. Сначала отдельным выпуском ослабляется чтение `PetSchema`: старые приложения строго проверяют ответ и иначе сломаются на новых ключах.

**Tech Stack:** Supabase Postgres (миграции в `supabase/migrations`), Zod 4 (`packages/contracts`), Next.js API (`apps/web`), Expo / React Native (`apps/mobile`), Vitest.

**Spec:** [mobile-api-plan.md → «Этап FB-2. Анкета и памятные даты»](../../mobile-api-plan.md#этап-fb-2-анкета-и-памятные-даты). Решения владельца от 20 октября 2026: дата рождения может быть примерной; прививки и вопрос о визите — отдельный шаг после анкеты, в одном экране.

## Global Constraints

- `packages/*` остаются переносимыми: без Next.js, серверных SDK и DOM (AGENTS.md).
- Перед кодом в `apps/web` читать `node_modules/next/dist/docs/` (AGENTS.md).
- Даты — календарные `YYYY-MM-DD` (`CalendarDateSchema`), «сегодня» — день телефона (`localToday`), не UTC.
- Никаких медицинских рекомендаций по возрасту или породе: справочник не проверен ветеринаром (MR-04). Тексты — «уточните у врача».
- Никогда `supabase config push`. Миграцию на прод применяет владелец до слияния (`supabase db push`).
- Тексты на русском и английском в `apps/mobile/src/i18n/{ru,en}.ts`; паритет ключей проверяет `i18n.test.ts`.
- Отчёт этапа — `docs/verification/feedback-02.md`.

## Review Focus

1. **Старое приложение и новый сервер.** Сборка из стора со строгим `PetSchema` получает `birth_date`, и список питомцев падает с `ApiContractError`. Ожидание: Task 1 выпущен и разошёлся до Task 2; тест чтения с лишним ключом есть в Task 1.
2. **Сайт меняет возраст питомцу с датой рождения.** Веб шлёт `age_years` без `birth_date`. Ожидание: сервер стирает `birth_date` и `birth_date_approx`, иначе правка возраста на сайте молча ничего не меняет. Тест — в Task 2.
3. **Рождён 29 февраля.** В невисокосный год поздравление 28 февраля, а не никогда. Тест — в Task 3.
4. **«Вместе» раньше рождения или в будущем.** `adopted_on < birth_date` или `adopted_on > today` отклоняется контрактом. Тест — в Task 2.
5. **Повторное «Готово» на шаге прививок** (двойное нажатие, плохая сеть). Ожидание: прививки не дублируются, потому что ключ идемпотентности один на попытку экрана. Тест — в Task 6.

---

## Файлы

| Файл | Ответственность |
| --- | --- |
| `packages/contracts/src/pet.ts` | Новые поля чтения и записи, проверка порядка дат |
| `supabase/migrations/20261020120000_pet_dates.sql` | Колонки `birth_date`, `birth_date_approx`, `adopted_on` |
| `apps/web/src/server/pets/pet-contract.ts`, `shared/utils/pet-utils.ts`, `server/pets/pet-service.ts`, `shared/types/index.ts` | Отдача и запись полей, правило «возраст без даты стирает дату» |
| `packages/shared/src/pets/pet-dates.ts` (+ экспорт из `index.ts`) | `petAgeYears`, `approxBirthDate`, `daysTogether`, `isBirthday`, `togetherMilestone` |
| Вызовы `headAge(pet.age_years)` и `describePetProfile` | Возраст через `petAgeYears` |
| `apps/mobile/src/features/pets/pet-form.ts`, `PetFields.tsx` | Блок «Дата рождения» (точно / примерно) и «В семье с» |
| `apps/mobile/app/(tabs)/pets/[id]/index.tsx` | Строка «Вместе N дней», поздравление |
| `apps/mobile/src/features/pets/first-steps.ts`, `app/(tabs)/pets/[id]/first-steps.tsx`, `pets/new.tsx`, `pets/[id]/visit-form.tsx` | Шаг после анкеты |

---

### Task 1: Чтение `PetSchema` терпит новые ключи (отдельный выпуск)

**Files:**
- Modify: `packages/contracts/src/pet.ts:24` (`PetSchema`)
- Test: `apps/web/tests/unit/contracts/contracts.test.ts` (в `packages/contracts` своего прогона тестов нет; схемы проверяются здесь)

**Interfaces:**
- Produces: `PetSchema` — `z.object` (лишние ключи отбрасываются), поля прежние. `PetCreateInputSchema`/`PetUpdateInputSchema` остаются строгими.

- [ ] **Step 1: Тест**

```ts
it('drops a field a later server adds instead of failing (FB-2)', () => {
  const parsed = PetSchema.parse({ ...samplePet, birth_date: '2020-05-01' })
  expect(parsed).not.toHaveProperty('birth_date')
})
```

- [ ] **Step 2:** `cd apps/web && npx vitest run tests/unit/contracts/contracts.test.ts` — FAIL (unrecognized key).
- [ ] **Step 3:** Заменить `z.strictObject` на `z.object` в `PetSchema`, комментарий как у `HealthEventSchema` («a field a later server adds is dropped by an older app»). `toPetContract` продолжает собирать объект поле за полем.
- [ ] **Step 4:** Тест PASS; `npm run typecheck` и `npm test` во всех воркспейсах.
- [ ] **Step 5:** Коммит, отдельный PR, слияние. EAS Update не выпускается: решение владельца от 20 октября — все правки по отзывам уходят одним большим обновлением в конце. **Гейт:** серверная часть Task 2 не попадает в `main`, пока это большое обновление не выпущено и не разошлось. До того ветка FB-2 живёт отдельно и в `main` не сливается.

### Task 2: Колонки, контракт и запись на сервере

**Files:**
- Create: `supabase/migrations/20261020120000_pet_dates.sql`
- Modify: `packages/contracts/src/pet.ts`, `apps/web/src/server/pets/pet-contract.ts`, `apps/web/src/shared/utils/pet-utils.ts` (`sanitizePet`), `apps/web/src/server/pets/pet-service.ts` (`updatePet`), `apps/web/src/shared/types/index.ts` (`Pet`)
- Test: `apps/web/tests/integration/feedback-02.test.ts`, `apps/web/tests/unit/contracts/contracts.test.ts`

**Interfaces:**
- Produces (контракт, чтение): `birth_date: CalendarDate | null`, `birth_date_approx: boolean`, `adopted_on: CalendarDate | null`.
- Produces (запись, оба input-схемы, все необязательные): `birth_date: CalendarDate | null`, `birth_date_approx: boolean`, `adopted_on: CalendarDate | null`, `today: CalendarDate` (день владельца для проверки «не в будущем», не колонка — добавить в `FORM_CONTEXT_KEYS`).

- [ ] **Step 1: Миграция.** `alter table public.pets add column if not exists birth_date date, add column if not exists birth_date_approx boolean not null default false, add column if not exists adopted_on date` и `check (adopted_on is null or birth_date is null or adopted_on >= birth_date)`. Шапка-комментарий в стиле соседних миграций: зачем и что значит `birth_date_approx`.
- [ ] **Step 2: Тесты контракта** (`contracts.test.ts`, блок `pet contracts`): отклоняются `adopted_on < birth_date`, `birth_date > today`, `adopted_on > today` (проверки «не в будущем» — только когда `today` передан: сайт его не шлёт); `birth_date_approx: true` без `birth_date` отклоняется.
- [ ] **Step 3: Интеграционные тесты** (`feedback-02.test.ts`, локальный Supabase, по образцу `api-products.test.ts`):
  - `POST /pets` с тремя полями → `GET /pets/:id` возвращает их;
  - `PATCH` с одним `age_years: 5` у питомца с `birth_date` → `birth_date: null`, `birth_date_approx: false` (Review Focus 2);
  - `PATCH` с `birth_date` и `age_years` вместе → дата сохраняется;
  - старый питомец без полей отдаётся с `null`/`false`.
- [ ] **Step 4:** Тесты FAIL.
- [ ] **Step 5: Реализация.** Поля и `superRefine` в `pet.ts`; `toPetContract` добавляет три поля; `sanitizePet` читает их (`toCalendarDate` или null, boolean); в `updatePet`, если в теле есть `age_years` и нет `birth_date`, к обновлению добавляются `birth_date: null, birth_date_approx: false`.
- [ ] **Step 6:** `npx supabase db reset` → `npx supabase stop && npx supabase start` (иначе ломается storage, см. память) → `npm run test:integration` PASS; `npm test` в contracts и web PASS.
- [ ] **Step 7:** Коммит.

### Task 3: Общие расчёты дат

**Files:**
- Create: `packages/shared/src/pets/pet-dates.ts`, `packages/shared/src/pets/pet-dates.test.ts`
- Modify: `packages/shared/src/index.ts` (экспорт)

**Interfaces:**
- Produces:
  - `petAgeYears(pet: { birth_date: string | null; age_years: number | null }, today: string): number | null` — из даты рождения в годах с одним знаком после запятой; без даты — `age_years`.
  - `approxBirthDate(years: number, months: number, today: string): string` — `today` минус годы и месяцы, через `addMonths` из `record-overview`.
  - `daysTogether(adoptedOn: string | null, today: string): number | null` — `daysBetween(adoptedOn, today) + 1` (день знакомства — первый), null без даты.
  - `isBirthday(birthDate: string | null, approx: boolean, today: string): boolean` — false при `approx`.
  - `togetherMilestone(days: number): boolean` — `days % 100 === 0` или `days % 365 === 0`.
- Consumes: `addMonths`, `daysBetween` из `packages/shared/src/medical-record/record-overview.ts`.

- [ ] **Step 1: Тесты**

```ts
expect(petAgeYears({ birth_date: '2020-10-20', age_years: 9 }, '2026-10-20')).toBe(6)
expect(petAgeYears({ birth_date: '2026-04-20', age_years: null }, '2026-10-20')).toBe(0.5)
expect(petAgeYears({ birth_date: null, age_years: 4 }, '2026-10-20')).toBe(4)
expect(approxBirthDate(4, 6, '2026-10-20')).toBe('2022-04-20')
expect(daysTogether('2026-10-20', '2026-10-20')).toBe(1)
expect(isBirthday('2020-02-29', false, '2026-02-28')).toBe(true)   // Review Focus 3
expect(isBirthday('2020-02-29', false, '2028-02-28')).toBe(false)
expect(isBirthday('2020-10-20', true, '2026-10-20')).toBe(false)
expect(togetherMilestone(2000)).toBe(true)
expect(togetherMilestone(2001)).toBe(false)
```

- [ ] **Step 2:** FAIL → **Step 3:** реализация → **Step 4:** `npx vitest run packages/shared/src/pets` PASS.
- [ ] **Step 5:** Коммит.

### Task 4: Возраст везде через `petAgeYears`

**Files:**
- Modify: `apps/mobile/src/features/medical-record/overview.ts:59`, `apps/mobile/app/(tabs)/pets/index.tsx:26`, `apps/web/src/features/medical-record/view-model.ts:97`, `apps/web/src/features/medical-record/summary/summary-view.ts:146`, `apps/web/src/shared/utils/pet-summary.ts` (`headAge` → `petAgeYears`), `apps/web/src/server/symptom-check/analyze-symptom-check.ts:235` (`describePetProfile` получает `today`), `apps/web/src/server/checks/load-check-pages.ts:9` (в `PET_COLUMNS` добавить `birth_date`)
- Test: существующие тесты этих модулей, плюс по одному случаю «есть `birth_date` → возраст из неё»

**Interfaces:**
- Consumes: `petAgeYears` (Task 3).

- [ ] **Step 1:** В тест `describePetProfile` добавить случай: `birth_date: '2020-10-20'`, `age_years: 9`, today `2026-10-20` → строка содержит `6 years old`. FAIL.
- [ ] **Step 2:** Заменить вызовы. `headAge` удалить, если вызовов не осталось.
- [ ] **Step 3:** `npm run typecheck && npm test` в web, mobile и shared PASS.
- [ ] **Step 4:** Коммит.

### Task 5: Анкета — дата рождения и «В семье с»; карточка — «вместе N дней»

**Files:**
- Modify: `apps/mobile/src/features/pets/pet-form.ts`, `pet-form.test.ts`, `PetFields.tsx`, `apps/mobile/app/(tabs)/pets/[id]/index.tsx`, `src/i18n/{ru,en}.ts`; вызовы `formToInput`/`petToForm` в `app/(tabs)/pets/new.tsx` и `app/(tabs)/pets/[id]/edit.tsx` получают `localToday()`

**Interfaces:**
- Produces (`PetForm`): поле `ageYears` заменяется на `birthMode: 'exact' | 'approx'`, `birthDate: string` (ДД.ММ.ГГГГ), `approxYears: string`, `approxMonths: string`, `adoptedOn: string`.
- `formToInput(t, form, today)` отдаёт `birth_date`, `birth_date_approx`, `adopted_on`, `age_years` (из `petAgeYears` на сегодня, для сайта и старых клиентов) и `today`.
- `petToForm(pet, today)`: при `birth_date_approx` или только `age_years` → `birthMode: 'approx'`, годы и месяцы из `petAgeYears`; при точной дате → `'exact'`.
- Consumes: `approxBirthDate`, `petAgeYears`, `daysTogether`, `isBirthday`, `togetherMilestone` (Task 3).

- [ ] **Step 1: Тесты `pet-form.test.ts`:** «примерно 4 года 6 месяцев» на `2026-10-20` → `birth_date: '2022-04-20'`, `birth_date_approx: true`, `age_years: 4.5`; точная дата в будущем → ошибка у поля `birthDate`; пустые поля → все три `null`; `adoptedOn` раньше даты рождения → ошибка у `adoptedOn`; круг `petToForm` → `formToInput` у питомца с точной датой ничего не меняет.
- [ ] **Step 2:** FAIL → реализация. В `PetFields`: `Segment` «Знаю дату / Примерно», под ним `DateField` (max — сегодня) или два числовых `Field` («лет», «мес.»), ниже `DateField` «В семье с · необязательно».
- [ ] **Step 3: Карточка питомца.** Под строкой «Кот · Сибирская · 4 года»: `ru.pets.together(n)` → «Вместе 2000 дней» (через `plural`); в день-веху — `ru.pets.togetherMilestone(n)` → «Сегодня 2000 дней вместе!»; в день рождения — баннер `ru.pets.birthday(name)` → «С днём рождения, Мурка!» (падеж через `nameCase`, иначе «Мурка, с днём рождения!»).
- [ ] **Step 4:** `npx tsc --noEmit && npx vitest run` в `apps/mobile` PASS.
- [ ] **Step 5:** Коммит.

### Task 6: Шаг «Первые шаги» после анкеты

**Files:**
- Create: `apps/mobile/src/features/pets/first-steps.ts`, `first-steps.test.ts`, `apps/mobile/app/(tabs)/pets/[id]/first-steps.tsx`
- Modify: `apps/mobile/app/(tabs)/pets/new.tsx` (после сохранения из вкладки «Питомцы» — `router.replace('/pets/{id}/first-steps')`; из вкладки «Проверка» поведение прежнее), `apps/mobile/app/(tabs)/pets/[id]/visit-form.tsx` (параметры `status=planned&kind=checkup` для нового визита), `src/i18n/{ru,en}.ts`

**Interfaces:**
- Produces:
  - `type FirstStepsDraft = { vaccines: Record<VaccineTarget, { done: boolean; date: string }>; unsure: boolean; lastVisit: 'thisYear' | 'overYear' | 'never' | 'unknown' | null }`
  - `firstStepsRequests(draft, species, today): { events: HealthEventInput[]; vaccinatedFlag: boolean | null; offerCheckup: boolean }` — прививки с одной датой объединяются в одно событие `kind: 'vaccination', status: 'done'`, `items: [{ targets: [code], next_on }]`; `next_on = nextYear(date)`, если он `>= today`, иначе без него (как `nextPassed` в форме прививки); отмеченные без даты событий не создают, но дают `vaccinatedFlag: true`; `unsure` → ничего не создаётся, `vaccinatedFlag: null`; `offerCheckup` — при `'overYear'` или `'never'`.
- Consumes: `coreVaccinations`/`VACCINE_TARGETS` (основные для вида), `nextYear` (`due.ts`), `api.createHealthEvent`, `api.updatePet`, `newRequestKey`.

- [ ] **Step 1: Тесты `first-steps.test.ts`:** две прививки с одной датой → одно событие с двумя позициями; дата больше года назад → позиция без `next_on`; отмечена без даты → событий нет, `vaccinatedFlag: true`; «не помню» → пусто; `'never'` → `offerCheckup: true`, `'thisYear'` → false; дата в будущем → ошибка у поля.
- [ ] **Step 2:** FAIL → реализация `first-steps.ts`.
- [ ] **Step 3: Экран.** Заголовок «Расскажите про прививки»; строки основных прививок вида (подписи из `medicalRecord.targets`), у отмеченной — `DateField` «Когда последний раз · необязательно»; переключатель «Не помню». Ниже — `Segment` «Когда последний раз были у врача»: «В этом году / Больше года назад / Ни разу / Не помню». Док: «Готово» и ссылка «Пропустить». После «Готово» при `offerCheckup` — карточка «Стоит показать Мурку врачу — запланировать осмотр?» с кнопкой (`visit-form?status=planned&kind=checkup`) и ссылкой «Не сейчас» (ведёт на карточку питомца). Ключ идемпотентности: один `useRef(newRequestKey())` на событие, создаётся при открытии экрана (Review Focus 5).
- [ ] **Step 4: Тест на повтор.** В `first-steps.test.ts`: `firstStepsRequests` детерминирован — одинаковый черновик даёт одинаковые тела; на экране ключи не пересоздаются между нажатиями (проверка вручную в симуляторе, записать в отчёт).
- [ ] **Step 5:** `npx tsc --noEmit && npx vitest run` PASS.
- [ ] **Step 6:** Коммит.

### Task 7: Проверка в симуляторе и отчёт

- [ ] **Step 1:** Локальный стек по образцу FB-1 (`docs/verification/feedback-01.md`, раздел «Ручные проверки»): `supabase start`, `next dev -p 3100` с `.env.integration`, Metro с `.env.local.local-stack`, вход по magic link.
- [ ] **Step 2:** Сценарии: новый питомец «примерно 3 года» → «Первые шаги» → две прививки с датой и одна без → «Ни разу у врача» → запланировать осмотр; карточка показывает возраст, «Вместе N дней»; выставить `adopted_on` так, чтобы сегодня было 100 дней, — видна веха; `birth_date` с сегодняшним днём и месяцем — виден баннер; питомец, созданный до миграции, открывается и сохраняется.
- [ ] **Step 3:** `docs/verification/feedback-02.md` по форме `feedback-01.md`, строка в `docs/verification/README.md`, отметки FB-2 в `docs/mobile-api-plan.md`.
- [ ] **Step 4:** Коммит, PR. Перед слиянием владелец применяет миграцию на прод.

---

### Task 8: Вес новорождённых в граммах (добавлено 20 октября по отзыву)

**Files:**
- Modify: `packages/shared/src/medical-record/weight-entry.ts` (+ тест), `apps/mobile/src/features/pets/pet-form.ts`, `PetFields.tsx`, `apps/mobile/src/features/medical-record/weight.ts`, `WeightSheet.tsx`, `src/i18n/{ru,en}.ts`

**Interfaces:**
- Produces (shared): `WEIGHT_MAX_GRAMS = 9999`; `parseWeightGrams(text: string): ParsedWeight` — целые граммы от 1 до 9999, значение в килограммах (`85` → `0.085`); `weightUnitFor(kg: number | null): 'kg' | 'g'` — граммы для веса меньше 1 кг.
- Produces (mobile): у `PetForm` и черновика веса в медкарте поле `weightUnit: 'kg' | 'g'`; переключатель «кг / г» рядом с полем веса; `t.medicalRecord.weight(kg)` выводит вес меньше 1 кг в граммах («85 г»).
- Контракт и база не меняются: вес хранится в килограммах, `weight_kg > 0`.

- [ ] **Step 1: Тесты.** `parseWeightGrams('85')` → `{ ok: true, value: 0.085 }`; `'0'`, `'10000'`, `'8,5'` → `invalid`; `weightUnitFor(0.085)` → `'g'`, `weightUnitFor(4.2)` → `'kg'`; форма питомца с `weightUnit: 'g'` и «85» шлёт `weight_kg: 0.085`; питомец с 0.085 кг открывается как «85» и «г»; `ru.medicalRecord.weight(0.085)` → «85 г».
- [ ] **Step 2:** FAIL → реализация → PASS.
- [ ] **Step 3:** Симулятор: новый питомец «примерно 0 лет 1 месяц», вес 85 г → карточка «85 г»; запись веса в медкарте в граммах.
- [ ] **Step 4:** Коммит, строка в отчёте FB-2.

## Отклонения от критериев в roadmap

- **FB-2/03:** «план по возрасту из справочника» заменён на предложение запланировать осмотр. Расписания прививок по возрасту в справочнике нет, а без ветеринара его не добавить (MR-04). Критерий в `mobile-api-plan.md` поправить в Task 7.
- **Новый пункт FB-2/00:** терпимое чтение `PetSchema` отдельным выпуском (Task 1), без него старые сборки ломаются.
