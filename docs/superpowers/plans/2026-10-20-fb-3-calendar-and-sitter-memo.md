# FB-3: календарь и памятка для передержки — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Запланированный визит или срок одной кнопкой открывается в Google Календаре как готовое событие; о питомце можно отправить памятку для передержки через системное «Поделиться».

**Architecture:** Только мобильное приложение, без нативных модулей и серверных изменений: событие в календаре — ссылка-шаблон Google Календаря (`Linking.openURL`), памятка — текст через `Share.share` из React Native. Тексты собираются чистыми функциями в `src/features/medical-record/`, экраны их только вызывают. Ветка `feature/fb-3` идёт от `feature/fb-2` (памятка берёт возраст через `headAge(pet, today)` из FB-2) и выпускается вместе с ней.

**Tech Stack:** Expo / React Native (`Linking`, `Share`), Vitest, i18n `apps/mobile/src/i18n/{ru,en}.ts`.

**Spec:** [mobile-api-plan.md → «Этап FB-3. Календарь и памятка для передержки»](../../mobile-api-plan.md#этап-fb-3-календарь-и-памятка-для-передержки). Решения владельца 20 октября 2026: календарь — ссылкой в Google Календарь (без `expo-calendar`, чтобы уйти обычным обновлением); памятка — «важное + планы на 2 недели».

## Global Constraints

- Никаких новых нативных модулей и разрешений: всё должно уходить EAS Update.
- В памятку не попадают проверки симптомов (критерий FB-3/02).
- Пустые разделы памятки не выводятся; текст читается без приложения (обычный текст, без разметки).
- Даты — календарные дни владельца (`localToday`); событие в календаре — на весь день.
- Тексты на русском и английском; паритет ключей проверяет `i18n.test.ts`.
- Отчёт этапа — `docs/verification/feedback-03.md`.

## Review Focus

1. **Кириллица, пробелы, `&` и `#` в названии и клинике.** Ссылка должна их закодировать, иначе событие в Google Календаре обрежется. Тест — в Task 1.
2. **Событие на последний день года.** Конец события на весь день — следующий день, `20261231/20270101`. Тест — в Task 1.
3. **Питомец без анкеты и без сроков.** В памятке только имя и вид, без пустых заголовков. Тест — в Task 2.
4. **Просроченные сроки.** В памятку попадают с пометкой «просрочено», а не теряются за окном в 14 дней. Тест — в Task 2.
5. **Google Календарь не установлен / ссылка не открылась.** Откроется браузер; если `openURL` бросил ошибку, это показано баннером, а не падением. Проверка вручную в Task 4.

---

## Файлы

| Файл | Ответственность |
| --- | --- |
| `apps/mobile/src/features/medical-record/calendar-link.ts` (+ тест) | Ссылка-шаблон Google Календаря для визита или срока |
| `apps/mobile/src/features/medical-record/sitter-memo.ts` (+ тест) | Текст памятки из обзора медкарты |
| `apps/mobile/app/(tabs)/pets/[id]/visit/[eventId].tsx`, `event/[eventId].tsx` | Ссылка «Добавить в календарь» у запланированной записи |
| `apps/mobile/app/(tabs)/pets/[id]/index.tsx` | Строка «Памятка для передержки» в списке разделов |
| `apps/mobile/src/i18n/{ru,en}.ts` | Тексты |

---

### Task 1: Ссылка в Google Календарь

**Files:**
- Create: `apps/mobile/src/features/medical-record/calendar-link.ts`, `calendar-link.test.ts`

**Interfaces:**
- Produces: `calendarLink(event: { title: string; date: string; details?: string | null; location?: string | null }): string`. Это URL `https://calendar.google.com/calendar/render?action=TEMPLATE&text=…&dates=YYYYMMDD/YYYYMMDD&details=…&location=…`: событие на весь день, конец — следующий день, параметры собраны через `URLSearchParams`, пустые `details` и `location` не добавляются.
- Produces: `calendarTitle(t: Dictionary, petName: string, what: string): string` — «Мурка: визит к врачу» (`ru.calendar.title`).

- [ ] **Step 1: Тесты**

```ts
const url = new URL(calendarLink({ title: 'Мурка: визит к врачу', date: '2026-10-21', location: 'Вега & Ко #1' }))
expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render')
expect(url.searchParams.get('action')).toBe('TEMPLATE')
expect(url.searchParams.get('text')).toBe('Мурка: визит к врачу')
expect(url.searchParams.get('dates')).toBe('20261021/20261022')
expect(url.searchParams.get('location')).toBe('Вега & Ко #1')
expect(url.searchParams.has('details')).toBe(false)
expect(new URL(calendarLink({ title: 'x', date: '2026-12-31' })).searchParams.get('dates')).toBe('20261231/20270101')
expect(calendarTitle(ru, 'Мурка', 'визит к врачу')).toBe('Мурка: визит к врачу')
```

- [ ] **Step 2:** `npx vitest run src/features/medical-record/calendar-link.test.ts` — FAIL (нет модуля).
- [ ] **Step 3:** Реализация; следующий день — `addMonths` не подходит, взять `daysBetween`-совместимое прибавление дня через `Date.UTC`.
- [ ] **Step 4:** PASS → коммит.

### Task 2: Текст памятки

**Files:**
- Create: `apps/mobile/src/features/medical-record/sitter-memo.ts`, `sitter-memo.test.ts`

**Interfaces:**
- Consumes: `HealthOverview` (`pet`, `events`, `medications`), `headAge` (shared), `isTakenNow` (shared), `dueItems`, `dueStatus`, `itemTitle` (`due.ts`), `t.diet`, `t.species`.
- Produces: `sitterMemo(t: Dictionary, overview: HealthOverview, today: string): string`.

Состав, разделы через пустую строку, каждый только если есть данные:
1. `Мурка — кот, Сибирская, 6 лет` (вид из `t.species`, порода, возраст по `headAge`).
2. `Питание: Сухой корм` (`t.diet`).
3. `Аллергии: курица; рыба, кроме лосося` — пункты через «; », чтобы пункт с запятой не распадался.
4. `Хронические болезни: …` — так же.
5. `Лекарства сейчас:` и по строке на курс `isTakenNow`: `— Нефростоп, 1 таблетка утром` (дозировка, если есть).
6. `Заметки: …`.
7. `Ближайшие 2 недели:` и по строке на срок с датой не позже `today + 14`, включая просроченные: `— 21 октября: визит к врачу, Вега`; просроченный — `— просрочено с 10 октября: прививка «Нобивак Tricat»`.
8. Последняя строка — `Отправлено из «Лапки»`.

- [ ] **Step 1: Тесты**
  - полный обзор (все разделы) → строка точно равна ожидаемому тексту (эталон в тесте);
  - питомец без анкеты, без курсов и сроков → `'Мурка — кот\n\nОтправлено из «Лапки»'` (Review Focus 3);
  - срок через 15 дней не попадает, через 14 — попадает; просроченный попадает с «просрочено с» (Review Focus 4);
  - законченный курс (`ended_on` < today) и курс, который ещё не начался, не попадают;
  - в тексте нет слов из проверок симптомов: функция их не получает (проверяется сигнатурой).
- [ ] **Step 2:** FAIL → **Step 3:** реализация → **Step 4:** PASS → коммит.

### Task 3: Кнопки на экранах

**Files:**
- Modify: `apps/mobile/app/(tabs)/pets/[id]/visit/[eventId].tsx`, `event/[eventId].tsx`, `app/(tabs)/pets/[id]/index.tsx`, `src/i18n/{ru,en}.ts`

**Interfaces:**
- Consumes: `calendarLink`, `calendarTitle` (Task 1), `sitterMemo` (Task 2), `Linking.openURL`, `Share.share({ message })`.

- [ ] **Step 1:** На экране запланированного визита и записи (только `status === 'planned'`) под карточкой — `LinkButton` «Добавить в календарь» (`ru.calendar.add`). Название — `calendarTitle(t, pet.name, …)`: для визита `t.medicalRecord.visits.dueTitle` в нижнем регистре, для прививки или обработки — `dueLineTitle`. `location` — клиника записи. При ошибке `openURL` — баннер `ru.calendar.failed` «Не удалось открыть календарь».
- [ ] **Step 2:** На карточке питомца в списке разделов (после «Вес») — строка `SettingRow` с новой иконкой `share` (добавить в `src/ui/Icon.tsx`: квадрат со стрелкой вверх, в стиле остальных контурных глифов): «Памятка для передержки», подпись «Важное и планы на 2 недели — в Telegram или куда удобно». Нажатие → `Share.share({ message: sitterMemo(t, overview, localToday()) })`. Отмену шаринга ошибкой не считать.
- [ ] **Step 3:** `npx tsc --noEmit && npx vitest run` в apps/mobile PASS → коммит.

### Task 4: Симулятор, отчёт, roadmap

- [ ] **Step 1:** Локальный стек по образцу FB-2 (`docs/verification/feedback-02.md`, «Окружение»), обязательно на свободных портах и своём симуляторе.
- [ ] **Step 2:** Сценарии:
  - запланированный визит → «Добавить в календарь» → в Safari или приложении открылся Google Календарь с названием, датой и клиникой;
  - просроченная прививка → то же;
  - «Памятка для передержки» → системное «Поделиться» с текстом; текст скопирован в заметки и проверен глазами;
  - питомец без данных → короткая памятка без пустых разделов.
- [ ] **Step 3:** Отчёт `docs/verification/feedback-03.md`, строка в `docs/verification/README.md`. В `docs/mobile-api-plan.md` поправить FB-3/01 под решение «ссылка в Google Календарь»: приёмка — событие открывается в Google Календаре с названием, датой и клиникой на iOS и Android.
- [ ] **Step 4:** Коммит, финальное ревью ветки отдельным агентом, исправления, пуш. В `main` не сливать до большого выпуска вместе с FB-2.

---

## Отклонения от критериев в roadmap

- **FB-3/01:** вместо системного календаря — ссылка в Google Календарь. Решение владельца: без нативного модуля и новой сборки в сторах. Отказа в доступе к календарю нет, потому что разрешение не запрашивается. Критерий в `mobile-api-plan.md` поправить в Task 4.
