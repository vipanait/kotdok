# Документы питомца с распознаванием — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** владелец загружает документ питомца (фото страниц или PDF), файл хранится у питомца, а ветпаспорт и рецепт распознаются в предложения для медкарты. Владелец проверяет их на отдельном экране и сохраняет.

**Architecture:**
- Документы хранятся в двух таблицах (`pet_documents`, `pet_document_files`) и приватном бакете `pet-documents`. Загрузка устроена как у аватара: разрешение, PUT, проверка байтов на сервере.
- Хранилище спрятано за модулем `document-storage`, чтобы потом заменить Supabase на Selectel.
- Распознавание выполняется внутри запроса, как анализ симптомов: `gpt-5.4`, строгая JSON-схема из zod. Результат — черновик в `pet_documents.draft`.
- Подтверждение сохраняет записи одной SQL-функцией.
- Три этапа: DOC-1 — хранение на сайте; DOC-2 — распознавание и новая редакция согласия на сайте; DOC-3 — приложение.

**Tech Stack:** Supabase Postgres и Storage, Next.js 16 (App Router, API `/api/v1`), OpenAI SDK `openai` ^6.34, zod 4, Expo (iOS и Android), Vitest (unit и integration на локальном Supabase).

**Spec:** [docs/superpowers/specs/2026-11-13-pet-documents-recognition-design.md](../specs/2026-11-13-pet-documents-recognition-design.md). Исполнитель читает спеку целиком: статусы, правила сопоставления, правила экрана проверки и кредитов описаны там и здесь не повторяются.

## Global Constraints

- `apps/web`: перед кодом прочитать нужные гайды в `node_modules/next/dist/docs/` (маршруты, `maxDuration`, серверные компоненты). Это не тот Next.js, что в памяти модели.
- `packages/*` остаются переносимыми: без Next.js, без серверных SDK, без DOM. Схема распознавания (zod) живёт в `packages/contracts`, преобразование в JSON-схему для OpenAI — на сервере.
- Миграции. Метку берём следующей свободной после `supabase migration list --workdir . --local` (13 ноября занята `20261113150000`). Применяем `supabase migration up --workdir . --local`. **Никогда `supabase db reset`** и никогда `supabase config push`.
- Доступ к новым таблицам: RLS включён, `revoke all … from anon, authenticated`, функции `security definer` с `set search_path = public`, `execute` только у `service_role`. Новые таблицы получают триггер `refuse_late_writes` (образец — `20261025120000_followup_cases.sql:96-106`).
- Тексты интерфейса — на русском и английском:
  - приложение: `apps/mobile/src/i18n/{ru,en}.ts`;
  - сайт: `apps/web/src/shared/i18n/dictionaries/{ru,en}.ts`; новый срез словаря регистрируется в `slices.ts`.
- Лимиты (`DOCUMENT_LIMITS`):

  | Что | Значение |
  |---|---|
  | Картинка | JPEG/PNG/WebP, до 5 МБ, сторона до 4096 |
  | Сжатие на клиенте | длинная сторона 2000, качество 0,8 |
  | Страниц-картинок | до 8 |
  | PDF | 1 файл, до 10 МБ, до 10 страниц, без шифрования |
  | Документов у питомца | до 30 |
  | Название | до 100 знаков |

- Лимиты запросов: `document_create` 20/ч, `document_recognize` 10/ч.
- Кредиты: 3 бесплатных распознавания на питомца навсегда (`pets.free_recognitions_used`), дальше 1 кредит. Неудача не тратит ни то, ни другое. Отказ от черновика ничего не возвращает.
- Модель: `gpt-5.4`, `temperature: 0`, `response_format` `json_schema` со `strict: true`, таймаут 90 с, 1 повтор. Маршрут — `maxDuration = 180`.
- В логах и в черновике нет ФИО, адреса и телефона владельца и нет текста документа.
- Выпуск:
  - merge в main, миграции на продакшене (`db push`) и сборки в сторы делает владелец;
  - EAS Update не выпускать;
  - в main не мержить.
- Бинарные файлы под `docs/` (скриншоты, тестовые документы) не коммитить, даже `git add -f`.

## Review Focus

1. **Два распознавания одного документа или одного питомца одновременно.** Двойное нажатие или два устройства не дают два списания и не делают из третьего бесплатного четвёртый. Тест: Task 7, `concurrent recognitions spend one free use`.
2. **Повторная отправка «Сохранить»** (обрыв сети после ответа) не создаёт записи дважды. Тест: Task 8, `confirm is idempotent by key`.
3. **Документ удалён, пока висит в `recognizing`.** Ответ модели не воскрешает документ, кредит возвращается. Тест: Task 7, `deleted while recognizing refunds and stores nothing`.
4. **Чужой документ по id из своего питомца** (подмена `docId` или `petId` в URL) отвечает `404` на всех маршрутах. Тест: Task 3, `another owner's document is not found on every route`.
5. **Нечитаемые и вредные файлы:**
   - PDF с паролем;
   - PDF больше 10 страниц;
   - файл с подписью JPEG, но телом PDF;
   - PUT большего файла, чем заявлено.

   Все отклоняются при `complete`, объекты удаляются. Тест: Task 2, `verifyDocumentFile refuses …` и Task 3, `complete removes objects of a bad document`.

---

## Карта файлов

| Файл | Ответственность |
|---|---|
| `packages/contracts/src/documents.ts` | Виды, статусы, лимиты, схемы ввода и ответа, схема распознавания, схема подтверждения |
| `packages/contracts/src/index.ts`, `openapi.ts`, `pet.ts` | Экспорт, OpenAPI-описания маршрутов, признак `pet-documents` |
| `packages/shared/src/documents/review.ts` | Правила экрана проверки: какие записи отмечены, можно ли отметить, сборка тела подтверждения |
| `packages/shared/src/documents/pricing.ts` | Подпись кнопки «Распознать» по остатку и балансу |
| `supabase/migrations/<метка>_pet_documents.sql` | DOC-1: таблицы, бакет, `stale_document_objects`, удаление в `delete_account_data` |
| `supabase/migrations/<метка>_document_recognition.sql` | DOC-2: `source_document_id`, `pets.free_recognitions_used`, `reserve_document_recognition`, `finish_document_recognition`, `fail_document_recognition`, `confirm_pet_document`, новая редакция согласия |
| `apps/web/src/server/documents/document-storage.ts` | Интерфейс хранилища и реализация на Supabase Storage |
| `apps/web/src/server/documents/document-verify.ts` | Проверка байтов картинки и PDF |
| `apps/web/src/server/documents/document-service.ts` | Создание, завершение, список, чтение, правка, удаление, удаление с питомцем и аккаунтом, очистка |
| `apps/web/src/server/documents/recognize.ts` | Вызов модели и разбор ответа |
| `apps/web/src/server/documents/draft.ts` | Ответ модели → черновик: сопоставление со справочником, проверка дат, дубли, обрезка |
| `apps/web/src/server/documents/recognition-service.ts` | Запуск, списание, итог, сбой, отказ от черновика, подтверждение |
| `apps/web/src/app/(backend)/api/v1/pets/[id]/documents/**` | Маршруты |
| `apps/web/src/features/documents/**`, `apps/web/src/app/(frontend)/pets/[id]/(pet)/documents/**` | Сайт: список, загрузка, просмотр, экран проверки |
| `apps/mobile/src/features/documents/**`, `apps/mobile/app/(tabs)/pets/[id]/documents/**` | Приложение |

---

# Этап DOC-1. Хранение документов (сайт)

## Критерии приёмки DOC-1

- [ ] **DOC-1/01.** Владелец создаёт документ из 1–8 картинок или одного PDF.
  - Проходят:
    - свой JPEG, PNG или WebP до 5 МБ со стороной до 4096;
    - PDF до 10 МБ и 10 страниц.
  - Отклоняются:
    - неверный тип;
    - превышение размера;
    - девятая страница;
    - смесь картинок и PDF;
    - PDF с паролем;
    - PDF больше 10 страниц;
    - тело, не совпадающее с заявленным типом.

  При отказе документ и его объекты удаляются.
- [ ] **DOC-1/02.** Список документов питомца показывает вид, название, дату, число страниц и статус. Просмотр открывает страницы по подписанной ссылке; анонимно и чужим пользователем объект не читается.
- [ ] **DOC-1/03.** Правка названия, вида и даты; удаление документа удаляет объекты и строки.
- [ ] **DOC-1/04.** Тридцать первый документ у питомца отклоняется. `document_create` больше 20 в час отклоняется с `429`.
- [ ] **DOC-1/05.** Удаление питомца удаляет его документы и объекты. Удаление аккаунта очищает `pet-documents/{userId}/` и строки обеих таблиц; воркер удаления проходит до конца.
- [ ] **DOC-1/06.** Брошенный `pending` старше 3 часов и его объекты удаляются ежедневной очисткой.
- [ ] **DOC-1/07.** Сайт:
  - строка «Документ» в выборе типа записи;
  - раздел «Документы» в медкарте;
  - загрузка с компьютера и телефона (фото и PDF);
  - просмотр страниц;
  - удаление с подтверждением.

  Всё на русском и английском.
- [ ] **DOC-1/08.** Старая сборка приложения читает обзор медкарты без ошибки: `writable` не содержит `documents` без признака `pet-documents`.

Готово, когда: все пункты приняты, отчёт `docs/verification/documents-01.md`.

### Task 1: Контракты документов

**Files:**
- Create: `packages/contracts/src/documents.ts`
- Modify: `packages/contracts/src/index.ts`, `packages/contracts/src/pet.ts` (константа `FEATURE_PET_DOCUMENTS = 'pet-documents'`), `packages/contracts/src/medical-record.ts` (`HEALTH_SECTIONS` + `'documents'` в конце; `HealthOverviewSchema.writable` читает неизвестные разделы терпимо — отбрасывает их, как `readableEvents`)
- Test: `apps/web/tests/unit/contracts/documents.test.ts`

**Interfaces — Produces:**
- `DOCUMENT_KINDS = ['vet_passport','prescription','discharge','lab_results','other']`, `RECOGNIZABLE_KINDS = ['vet_passport','prescription']`
- `DOCUMENT_STATUSES = ['pending','stored','recognizing','review','confirmed','failed']`
- `DOCUMENT_LIMITS = { imageMaxBytes: 5*1024*1024, imageMaxSide: 4096, maxImages: 8, pdfMaxBytes: 10*1024*1024, pdfMaxPages: 10, perPet: 30, titleMax: 100, grantSeconds: 15*60, clientLongSide: 2000, clientQuality: 0.8 }`
- `DOCUMENT_CONTENT_TYPES = ['image/jpeg','image/png','image/webp','application/pdf']`
- `DocumentCreateInputSchema` (`kind`, `title?`, `files: [{content_type, size_bytes}]` с правилами: 1–8 картинок или ровно один PDF; размер по типу)
- `DocumentGrantSchema` (`document_id`, `uploads: [{file_id, url, method:'PUT', headers, expires_at}]`)
- `DocumentPatchSchema` (`title?`, `kind?`, `document_date?` nullable; хотя бы одно поле)
- `PetDocumentSchema` (нестрогая, для чтения): `id, kind, title, document_date, status, failure_code, page_count, created_at, files: [{id, content_type, url, page_count}]`, `draft: DocumentDraft | null` (`.default(null)`)
- `DocumentListSchema` (`documents`, `free_recognitions_left: number`, `recognition_price: 0|1`)

- [ ] **Step 1: Тесты** — `accepts 1..8 images or one pdf`, `refuses mixed images and pdf`, `refuses 9 images`, `refuses pdf over 10 MB and image over 5 MB`, `patch needs a field`, `overview drops an unknown writable section` (`writable: ['vaccinations','xrays']` → `['vaccinations']`), `old overview without documents parses`.
- [ ] **Step 2:** `npm run test --workspace @lapka/web -- tests/unit/contracts/documents.test.ts` — FAIL (модуля нет).
- [ ] **Step 3:** Реализовать схемы и терпимое чтение `writable`.
- [ ] **Step 4:** Тот же прогон — PASS; `npm run typecheck`.
- [ ] **Step 5:** Commit `Contracts: pet documents`.

### Task 2: Проверка файлов документа

**Files:**
- Create: `apps/web/src/server/documents/document-verify.ts`
- Modify: `apps/web/package.json` (библиотека для PDF — см. шаг 3)
- Test: `apps/web/tests/server/documents/document-verify.test.ts`, фикстуры в `apps/web/tests/fixtures/documents/` (генерируются в тесте: маленькие PDF создаются той же библиотекой, картинки — байтами, как в `photo-verify.test.ts`)

**Interfaces — Produces:**
- `verifyDocumentFile(bytes: Uint8Array, declared: DocumentContentType): Promise<{ ok: true; contentType: DocumentContentType; pageCount: number } | { ok: false; reason: 'unsupported_media_type' | 'payload_too_large' | 'too_many_pages' | 'encrypted' }>`

- [ ] **Step 1: Тесты** — `accepts a jpeg within limits` (pageCount 1), `accepts a 3 page pdf` (pageCount 3), `verifyDocumentFile refuses an encrypted pdf`, `… refuses an 11 page pdf`, `… refuses pdf bytes declared as jpeg`, `… refuses a jpeg wider than 4096`, `… refuses a pdf over 10 MB`.
- [ ] **Step 2:** Прогон — FAIL.
- [ ] **Step 3:** Реализовать.
  - Картинки — через существующий `verifyPhoto`.
  - PDF:
    - подпись `%PDF-`;
    - размер;
    - разбор и подсчёт страниц библиотекой `pdf-lib`: чистый JS, работает на Vercel, ошибка шифрования при загрузке означает `encrypted`.

  Сверить API по типам в `node_modules/pdf-lib` после установки.
- [ ] **Step 4:** Прогон — PASS.
- [ ] **Step 5:** Commit `Web: verify document files`.

### Task 3: Таблицы, бакет и служба документов

**Files:**
- Create: `supabase/migrations/<метка>_pet_documents.sql`, `apps/web/src/server/documents/document-storage.ts`, `apps/web/src/server/documents/document-service.ts`
- Modify: `apps/web/src/server/api/rate-limit.ts` (`document_create: { limit: 20, windowSeconds: 3600 }`)
- Test: `apps/web/tests/integration/documents-01.test.ts`, `apps/web/tests/integration/documents-sql.test.ts`

Миграция:
- `pet_documents` и `pet_document_files` — колонки по спеке, раздел «Данные». Ограничения:
  - `kind` и `status` в списке;
  - `title` до 100 знаков;
  - `unique (document_id, position)`;
  - `object_path unique`;
  - каскад от `auth.users` и `pets`.
- Бакет `pet-documents`: приватный, `file_size_limit` 10 МБ, четыре типа.
- `stale_document_objects(p_cutoff timestamptz, p_limit int)` — образец `stale_avatar_objects`: объекты бакета старше cutoff, на которые не ссылается файл документа не в `pending`.
- В `delete_account_data` удаляются `pet_document_files`, затем `pet_documents`, до `pets`. Функцию переписать целиком из последней версии (`20261025110000`).
- Триггеры `refuse_late_writes` на обе таблицы.

**Interfaces — Produces:**
- `document-storage.ts`:
  - `type DocumentStorage = { grantWrite(path, contentType): Promise<{url, headers, expiresAt}>; download(path): Promise<Uint8Array>; signRead(paths: string[], seconds: number): Promise<(string|null)[]>; remove(paths: string[]): Promise<void>; removePrefix(prefix: string): Promise<void> }`;
  - `supabaseDocumentStorage(supabase): DocumentStorage`;
  - `DOCUMENT_BUCKET = 'pet-documents'`.
- `document-service.ts` (все функции принимают `{ supabase, storage, userId }` и возвращают `Result<T, DocumentFailure>`, где `DocumentFailure = 'not_found'|'limit_reached'|'unsupported_media_type'|'payload_too_large'|'too_many_pages'|'encrypted'|'wrong_status'|'storage_error'`):
  - `createDocument(petId, input)`;
  - `completeDocument(petId, docId)`;
  - `listDocuments(petId)`;
  - `readDocument(petId, docId)`;
  - `patchDocument(petId, docId, patch)`;
  - `deleteDocument(petId, docId)`;
  - `removePetDocuments(petId)`;
  - `removeUserDocuments(userId)`;
  - `sweepDocuments(now, batch)`.

- [ ] **Step 1: Тест SQL** (`documents-sql.test.ts`):
  - `anon and authenticated cannot read the tables`;
  - `late write after deletion request is refused`;
  - `delete_account_data removes documents` (+ проверка, что функция не падает при документах и записях медкарты).
- [ ] **Step 2: Тест службы** (`documents-01.test.ts`):
  - `creates and completes a 2 image document`;
  - `complete removes objects of a bad document`;
  - `the 31st document is refused`;
  - `delete removes objects and rows`;
  - `another owner's document is not found on every route`;
  - `sweep removes pending older than 3h with its objects`;
  - `pet deletion removes its documents`.
- [ ] **Step 3:** Метка миграции, применить локально, прогон `npm run test:integration -- tests/integration/documents-sql.test.ts tests/integration/documents-01.test.ts` — FAIL по службе.
- [ ] **Step 4:** Реализовать хранилище и службу.
  - Путь объекта — `userId/petId/documentId/uuid`.
  - Документ создаётся в `pending`, через `pet_documents` проверяется, что питомец принадлежит владельцу и жив.
  - `complete`: скачать → `verifyDocumentFile` → `verified_at`, `page_count`, статус `stored`; при отказе удалить объекты и строки.
  - Чтение: подписанные ссылки на час.
- [ ] **Step 5:** Подключить:
  - `removePetDocuments` — в `softDeletePetAndChecks` (`apps/web/src/server/pets/pet-service.ts:303`);
  - `removeUserDocuments` — в `removeUserPhotos` (`apps/web/src/server/uploads/photo-storage.ts:108`);
  - `sweepDocuments` — в `cron/photo-uploads`.

  Добавить в `deletion-photos.test.ts` случай `photos step clears pet-documents`.
- [ ] **Step 6:** Прогон всех интеграционных тестов удаления и документов — PASS.
- [ ] **Step 7:** Commit `Web + DB: pet documents storage`.

### Task 4: Маршруты API документов

**Files:**
- Create:
  - `apps/web/src/app/(backend)/api/v1/pets/[id]/documents/route.ts` (GET, POST);
  - `…/documents/[docId]/route.ts` (GET, PATCH, DELETE);
  - `…/documents/[docId]/complete/route.ts` (POST).
- Modify: `packages/contracts/src/openapi.ts`, `apps/web/src/server/medical-record/overview-service.ts` (`documents` в `writable` только при `reads(request, FEATURE_PET_DOCUMENTS)`; сайт отправляет признак всегда)
- Test: `apps/web/tests/integration/documents-api.test.ts`

Маршруты сделаны по образцу `v1/pets/[id]/avatar/route.ts`: `withApiAuth`, лимит, разбор схемой, ошибки `apiError`. Соответствие отказов кодам:

| Отказ | Ответ |
|---|---|
| `limit_reached` | `409 conflict` |
| `too_many_pages`, `encrypted` | `422`, существующий код `bad_request` с `details.reason` |
| `wrong_status` | `409` |

- [ ] **Step 1: Тесты:**
  - `POST grants PUT urls`;
  - `PUT then complete stores the document`;
  - `GET lists with free_recognitions_left 3`;
  - `PATCH renames`;
  - `DELETE removes`;
  - `rate limit document_create 21st is 429`;
  - `overview writable has documents only with the feature header`;
  - `openapi validator accepts the document` (существующий тест схемы OpenAPI).
- [ ] **Step 2:** Прогон — FAIL.
- [ ] **Step 3:** Реализовать маршруты и OpenAPI.
- [ ] **Step 4:** Прогон — PASS.
- [ ] **Step 5:** Commit `Web: documents API`.

### Task 5: Документы на сайте

**Files:**
- Create:
  - `apps/web/src/features/documents/{DocumentList.tsx, DocumentUpload.tsx, DocumentViewer.tsx, prepare-pages.ts, document-api.ts}`;
  - страницы `apps/web/src/app/(frontend)/pets/[id]/(pet)/documents/page.tsx`, `…/documents/new/page.tsx`, `…/documents/[docId]/page.tsx`.
- Modify:
  - `apps/web/src/features/medical-record/AddRecordChooser.tsx` (строка «Документ»);
  - вкладки и навигация медкарты (раздел «Документы»);
  - словари `ru`/`en` (срез `documents`);
  - `slices.ts` (маршрут `pets/[id]` получает `documents`).
- Test: `apps/web/tests/unit/features/documents/prepare-pages.test.ts`

- [ ] **Step 1: Тест** `prepare-pages`:
  - картинка шире 2000 уменьшается до длинной стороны 2000 в JPEG 0,8 (как `features/pets/prepare-photo.ts`, белый фон);
  - PDF уходит без изменений;
  - 9-я картинка не добавляется.
- [ ] **Step 2:** FAIL → реализовать `preparePages(files: File[]): Promise<PreparedPage[]>` → PASS.
- [ ] **Step 3:** Экраны: выбор вида → файлы (input `accept="image/*,application/pdf"`, `capture` не ставить) → порядок страниц → «Сохранить документ». Список, просмотр (картинки с увеличением, PDF в новой вкладке по подписанной ссылке), удаление с подтверждением.
- [ ] **Step 4:** Проверка в браузере на `web-staging-prod` (dev-сервер в панели браузера не гидрируется):
  - загрузка двух JPEG и одного PDF;
  - просмотр;
  - удаление;
  - английский язык;
  - ширина 375.

  Скриншоты — рядом с отчётом, без коммита.
- [ ] **Step 5:** Commit `Web: documents pages`.

### Task 6: Отчёт DOC-1 и роадмап

**Files:**
- Create: `docs/verification/documents-01.md` (по `docs/verification/REPORT_TEMPLATE.md`)
- Modify: `docs/mobile-api-plan.md` — новый раздел «Документы питомца»: этапы DOC-1…DOC-3 со ссылками на спеку и план. Пункт про документы к визитам и распознавание лекарств помечается как перенесённый сюда; решение о хранилище от 20 октября обновляется решением от 13 ноября.

- [ ] **Step 1:** `npm run lint && npm run typecheck && npm run test && npm run test:integration` — всё зелёное, вывод в отчёт.
- [ ] **Step 2:** Отчёт: таблица DOC-1/01…08 с результатом и доказательством каждого пункта. Запрос суммы `size_bytes` для порога Selectel.
- [ ] **Step 3:** Commit `Docs: documents stage 1 report`.

---

# Этап DOC-2. Распознавание и новая редакция согласия (сайт)

## Критерии приёмки DOC-2

- [ ] **DOC-2/01.** «Распознать» у ветпаспорта или рецепта в статусе `stored` или `failed` запускает распознавание. Ответ `202`, итог — `review` с черновиком или `failed` с кодом. Документ другого вида или в другом статусе отклоняется.
- [ ] **DOC-2/02.** Черновик:
  - содержит прививки, обработки и курсы со страницей-источником;
  - не содержит ФИО, адреса и телефона владельца;
  - препарат из справочника подставлен только при однозначном совпадении, подходящем виду питомца и типу записи;
  - неуверенные поля помечены;
  - дубли существующих записей помечены;
  - даты в будущем и до рождения питомца очищены и помечены.
- [ ] **DOC-2/03.** Кредиты:
  - первые три успешных распознавания питомца бесплатны;
  - четвёртое списывает 1 кредит;
  - при нулевом балансе — `402 insufficient_credits`;
  - `failed` (сбой модели, отказ, `nothing_found`, просроченное `recognizing`) возвращает кредит и не тратит бесплатное;
  - удаление документа и отказ от черновика бесплатное не возвращают;
  - два одновременных запуска не дают лишнего списания;
  - `document_recognize` больше 10 в час — `429`.
- [ ] **DOC-2/04.** «Сохранить»:
  - создаёт отмеченные записи одной операцией: прививки и обработки сгруппированы по дате и виду, следующие даты становятся планами, лекарства — курсами;
  - каждая запись хранит `source_document_id`;
  - повтор с тем же ключом не создаёт записей;
  - неверная запись отклоняет всё.

  После сохранения документ `confirmed`, черновик пуст.
- [ ] **DOC-2/05.** «Не сохранять» возвращает документ в `stored`, черновик пуст. Удаление документа оставляет записи, их ссылка обнуляется.
- [ ] **DOC-2/06.** Экран проверки на сайте:
  - уверенные записи отмечены, неуверенные сняты с пометкой «Проверьте», дубли сняты с пометкой «Уже есть в медкарте»;
  - запись без даты или названия отметить нельзя;
  - правка записи использует правила форм медкарты;
  - «стр. N» открывает страницу;
  - предупреждение о чужой кличке;
  - кнопка «Распознать» показывает цену и остаток.

  Русский и английский.
- [ ] **DOC-2/07.** Запись медкарты из документа показывает «Из документа» со ссылкой. Пустые разделы «Прививки» и «Обработки» предлагают сфотографировать паспорт.
- [ ] **DOC-2/08.** Новая редакция согласия:
  - тексты `/legal/personal-data` и `/legal/privacy` на двух языках утверждены владельцем;
  - сайт и клиент с признаком `consent-editions` требуют её от каждого аккаунта без согласия на неё, без неё API отвечает `consent_required`;
  - клиент без признака работает по-старому;
  - ревью-аккаунты Apple и Google заранее согласились.
- [ ] **DOC-2/09.** Набор настоящих документов от владельца (10–15 паспортов и рецептов) прогнан. В отчёте по каждому:
  - найдено записей;
  - верных;
  - неуверенных;
  - лишних;
  - токены и время.

  Модель не возвращает данные владельца.

Готово, когда: все пункты приняты, отчёт `docs/verification/documents-02.md`.

### Task 7: Распознавание: модель, черновик, списание

**Files:**
- Create:
  - `packages/contracts/src/documents.ts` — дописать:
    - `RecognitionSchema` (форма из спеки, раздел «Распознавание»);
    - `DocumentDraftSchema` — записи с `key`, `type`, `page`, полями записи, `product_id`, `unsure: string[]`, `duplicate: boolean`, `selected_by_default: boolean`;
  - `apps/web/src/server/documents/{recognize.ts, draft.ts, recognition-service.ts}`;
  - `supabase/migrations/<метка>_document_recognition.sql` (часть про распознавание);
  - `…/documents/[docId]/recognition/route.ts` (POST, DELETE; `maxDuration = 180`).
- Modify: `rate-limit.ts` (`document_recognize: { limit: 10, windowSeconds: 3600 }`), `packages/contracts/src/errors.ts` (если нужен код `nothing_found` для `failure_code` — только как значение поля, не как HTTP-код)
- Test:
  - `apps/web/tests/server/documents/draft.test.ts` (юнит);
  - `apps/web/tests/integration/documents-02-recognition.test.ts` (модель подменена через зависимость `recognize`, как подменяется OpenAI в `check-jobs.test.ts`).

SQL:
- `pets.free_recognitions_used int not null default 0 check (between 0 and 3)`;
- `reserve_document_recognition(p_user_id, p_document_id) returns jsonb {charge, usage_ledger_id}`:
  - блокирует питомца;
  - статус должен быть `stored` или `failed`;
  - свободных = 3 − `free_recognitions_used` − число `recognizing` с `charge='free'`;
  - бесплатно или списание через `credit_ledger`;
  - статус `recognizing`;
  - ошибки `insufficient_credits`, `wrong_status`;
- `finish_document_recognition(p_user_id, p_document_id, p_draft jsonb, p_document_date date)` → `review`, и `free_recognitions_used + 1` при `charge='free'`;
- `fail_document_recognition(p_user_id, p_document_id, p_code text)` → `failed`, возврат кредита через `refund_symptom_check_usage` или его аналог для документа (решает исполнитель по форме `credit_ledger`; спека оставила это ему);
- просроченное `recognizing` (> 5 минут) переводится в `failed` при чтении документа, как `fail_stale_check_job`.

**Interfaces — Produces:**
- `recognize(input: { pages: RecognitionPage[]; kind: RecognizableKind; species: 'cat'|'dog'; petName: string; catalog: CatalogLine[] }): Promise<{ ok: true; recognition: Recognition; usage: TokenUsage } | { ok: false; code: 'refused'|'truncated'|'invalid'|'provider_error' }>`, где `RecognitionPage = { kind: 'image'; mime; base64 } | { kind: 'pdf'; base64; filename }`.
- `buildDraft(recognition, ctx: { pet: { species, birth_date }; today: string; catalog: HealthProduct[]; existing: { events: HealthEvent[]; medications: Medication[] } }): DocumentDraft`.
- `startRecognition(deps, userId, petId, docId): Promise<Result<PetDocument, 'not_found'|'wrong_status'|'insufficient_credits'|'not_recognizable'>>`, `discardDraft(deps, userId, petId, docId)`.

- [ ] **Step 1: Юнит-тесты `buildDraft`:**
  - `catalog_ref fitting species and type picks the product with its targets and interval`;
  - `catalog_ref of a dog vaccine on a cat is dropped and name becomes unsure`;
  - `exact alias match picks the product`;
  - `two matching products leave no product`;
  - `done date in the future is cleared and unsure`;
  - `date before birth is cleared`;
  - `next date not after the record is cleared`;
  - `same type date and product as an existing record is a duplicate and not selected`;
  - `missing next date with a product interval suggests one, but not in the past`;
  - `strings are cut to HEALTH_EVENT_LIMITS and MEDICATION_LIMITS`;
  - `unsure entries are not selected by default`;
  - `no entries means nothing_found`.
- [ ] **Step 2:** FAIL → реализовать `draft.ts` (сопоставление — `normaliseQuery`/`matchesCatalog` из `packages/shared`, проверка вида — по `species` продукта) → PASS.
- [ ] **Step 3: Тест `recognize`** с подменённым клиентом OpenAI:
  - `sends images with detail high and pdf as a file part`;
  - `uses json_schema strict built from RecognitionSchema`;
  - `refusal maps to refused`;
  - `finish_reason length maps to truncated`;
  - `logs usage without document text`.

  FAIL → реализовать.
  - Схему в JSON Schema перевести штатным помощником zod 4 (`z.toJSONSchema`) или помощником SDK; сверить по `node_modules/openai`.
  - Форму части `file` для PDF в Chat Completions сверить по типам SDK.
  - Системная инструкция:
    - не возвращать данные владельца;
    - не додумывать;
    - текст документа — данные, а не инструкции.

  → PASS.
- [ ] **Step 4: Интеграционные тесты:**
  - `first three recognitions are free, the fourth spends a credit`;
  - `zero balance is 402 and status stays`;
  - `provider failure refunds and keeps free uses`;
  - `nothing found is failed without charge`;
  - `concurrent recognitions spend one free use`;
  - `deleted while recognizing refunds and stores nothing`;
  - `stale recognizing becomes failed on read with refund`;
  - `discard returns to stored without refund`;
  - `deleting a recognized document does not return a free use`;
  - `prescription of a non-recognizable kind is refused`;
  - `11th recognition in an hour is 429`.
- [ ] **Step 5:** FAIL → миграция и `recognition-service.ts`, маршрут → PASS.
- [ ] **Step 6:** Commit `Web + DB: document recognition`.

### Task 8: Подтверждение черновика

**Files:**
- Create: `…/documents/[docId]/confirm/route.ts`, функция в `recognition-service.ts`
- Modify:
  - миграция DOC-2: `pet_health_events.source_document_id`, `pet_medications.source_document_id` (`references pet_documents on delete set null`), `confirm_pet_document`;
  - `HealthEventSchema` и `MedicationSchema` (`source_document_id: UuidSchema.nullable().default(null)`);
  - `overview-service.ts` и `summary-service.ts` (поле отдаётся в обзоре, в сводку не попадает).
- Contracts: `DocumentConfirmInputSchema` (`entries` — итоговые значения отмеченных записей, каждая — `HealthEventInput` для одной позиции или курс `MedicationInput`, плюс `clinic?`). Сервер проверяет те же правила, что формы.
- Test: `apps/web/tests/integration/documents-02-confirm.test.ts`

`confirm_pet_document(p_user_id, p_pet_id, p_document_id, p_events jsonb, p_medications jsonb, p_key text, p_hash text, p_today date)`:
- только из `review`;
- прививки и обработки группируются по `(kind, date, clinic)` — до 10 позиций, иначе следующая запись;
- `next_on` → план через `plan_next_items`;
- курсы — через `create_pet_medications`;
- всем ставится `source_document_id`;
- статус `confirmed`, `draft = null`;
- ключ идемпотентности — образец `health_event_by_key`.

- [ ] **Step 1: Тесты:**
  - `confirm creates grouped vaccinations with next plans`;
  - `confirm creates courses from a prescription`;
  - `every record has source_document_id`;
  - `confirm is idempotent by key`;
  - `an invalid entry refuses all and creates nothing`;
  - `confirm outside review is 409`;
  - `entries of a vaccine target on a parasite record are refused`;
  - `deleting the document keeps records and nulls the link`;
  - `vet summary has no document fields`;
  - `old app reading overview with source_document_id parses`.
- [ ] **Step 2:** FAIL → реализовать → PASS.
- [ ] **Step 3:** Commit `Web + DB: confirm document draft`.

### Task 9: Экран проверки и вход в распознавание на сайте

**Files:**
- Create:
  - `packages/shared/src/documents/review.ts`, `packages/shared/src/documents/pricing.ts` и их тесты;
  - `apps/web/src/features/documents/{RecognizeButton.tsx, ReviewScreen.tsx, ReviewEntry.tsx}`.
- Modify:
  - страница документа;
  - карточки записей медкарты («Из документа»);
  - пустые разделы «Прививки» и «Обработки»;
  - словари.

**Interfaces — Produces** (`packages/shared`):
- `initialSelection(draft: DocumentDraft): Record<string, boolean>`
- `canSelect(entry: EditedEntry): boolean`
- `confirmBody(draft, edits, selection, clinic): DocumentConfirmInput`
- `recognizeLabel(left: number, credits: number, locale): { text: string; disabled: boolean }`

- [ ] **Step 1: Тесты `review.ts`:**
  - `confident entries start selected`;
  - `unsure and duplicate start unselected`;
  - `an entry without date cannot be selected`;
  - `edits replace draft values in the body`;
  - `only selected entries are sent`.

  **Тесты `pricing.ts`:**
  - `free with 2 left`;
  - `one check when none left`;
  - `disabled with no credits and none left`.
- [ ] **Step 2:** FAIL → реализовать → PASS (`npm run test --workspace @lapka/shared`).
- [ ] **Step 3:** Экран по наброску спеки (раздел «Экран проверки»): опрос `GET` каждые 2 секунды, пока `recognizing`. Правка записи переиспользует поля и проверки форм сайта (`features/medical-record/events`, `medications`), выбор препарата — `CatalogCombobox`.
- [ ] **Step 4:** Браузер на `web-staging-prod` с подменённой моделью или реальным ключом staging:
  - паспорт → проверка → сохранение → записи в медкарте со ссылкой;
  - «Не сохранять»;
  - четвёртое распознавание за кредит;
  - английский;
  - ширина 375.
- [ ] **Step 5:** Commit `Web: document review screen`.

### Task 10: Новая редакция согласия

**Files:**
- Modify:
  - `packages/contracts/src/consent.ts` (`PD_CONSENT_VERSION` — дата выпуска, `PD_CONSENT_LEGACY_VERSION = '2026-09-26'`, `FEATURE_CONSENT_EDITIONS = 'consent-editions'`);
  - миграция DOC-2: `pd_consent_version_is_current` принимает обе;
  - `apps/web/src/server/auth/account-state.ts` (`loadAccount(…, { editions: boolean })`);
  - `with-api-auth.ts` (передаёт `reads(request, FEATURE_CONSENT_EDITIONS)`);
  - `load-cabinet.ts` (сайт всегда `editions: true`);
  - `consent-service.ts` (`GET /consent` отдаёт текущую редакцию; запись принимает обе, но новый клиент шлёт новую);
  - `packages/shared/src/api-client.ts` (признак `consent-editions` добавляется в DOC-3 вместе с экраном приложения, не раньше);
  - страницы `/legal/personal-data` и `/legal/privacy` (ru, en).
- Test: `apps/web/tests/integration/api-consent.test.ts`, `personal-data-consents-sql.test.ts`, `apps/web/tests/unit/legal/*`

Правило:
- с признаком (и на сайте) согласие нужно, если нет строки на `PD_CONSENT_VERSION`;
- без признака — по флагу `pd_consent_required` и редакции `2026-09-26`, как сейчас.

- [ ] **Step 1:** Черновик текстов по спеке (раздел «Согласие и политика») — отдельным коммитом. Передать владельцу на утверждение (`SendMessage` сессии-родителю или в итоговом сообщении). Задача ждёт ответа, остальные идут дальше.
- [ ] **Step 2: Тесты:**
  - `old account without new edition gets consent_required with the feature`;
  - `same account without the feature is let through`;
  - `cabinet asks an old account for the new edition`;
  - `recording the new edition lets everything through`;
  - `old app can still record 2026-09-26`;
  - `new account signs up with the new edition`.
- [ ] **Step 3:** FAIL → реализовать → PASS.
- [ ] **Step 4:** Перед merge в отчёт пишется SQL для ревью-аккаунтов: строки согласия на новую редакцию по `profiles.id` для `review@lapka.my` и `review-google@lapka.my`. Выполняет владелец.
- [ ] **Step 5:** Commit `Web + DB: consent edition for documents`.

### Task 11: Прогон на настоящих документах и отчёт DOC-2

**Files:**
- Create: `docs/verification/documents-02.md`; скрипт прогона в `apps/web/scripts/recognize-samples.ts` (читает папку, вызывает `recognize` и `buildDraft`, пишет таблицу); документы лежат рядом с отчётом и не коммитятся.

- [ ] **Step 1:** Попросить у владельца 10–15 фото и PDF паспортов и рецептов. Без них DOC-2/09 остаётся открытым, остальное закрывается.
- [ ] **Step 2:** Прогон, таблица по DOC-2/09, сверка с документами глазами. Если качество плохое (меньше 80% верных уверенных записей), это записывается в отчёт с примерами до выпуска. Выбор модели и порогов в этом случае решает владелец.
- [ ] **Step 3:** `npm run lint && npm run typecheck && npm run test && npm run test:integration`; отчёт по DOC-2/01…09.
- [ ] **Step 4:** Commit `Docs: documents stage 2 report`.

---

# Этап DOC-3. Приложение

Новая сборка в сторы, её делает владелец. Мобильный план ниже — уровень задач; перед началом этапа он уточняется по состоянию кода после DOC-2.

## Критерии приёмки DOC-3

- [ ] **DOC-3/01.** Новый документ:
  - выбор вида;
  - «Снять», «Из галереи», «Файл PDF»;
  - съёмка нескольких страниц подряд, удаление и перестановка;
  - сжатие до длинной стороны 2000 в JPEG 0,8 (HEIC превращается в JPEG);
  - PDF до 10 МБ.

  Загрузка не теряется при сворачивании до подтверждения: при возврате документ либо `stored`, либо удалён очисткой.
- [ ] **DOC-3/02.** Раздел «Документы» в медкарте, строка «Документ» в листе «Добавить», просмотр страниц с увеличением, PDF открывается системным просмотрщиком.
- [ ] **DOC-3/03.** Распознавание и экран проверки работают как на сайте (DOC-2/06, DOC-2/07), правила из `packages/shared`.
- [ ] **DOC-3/04.** Карточка «Сфотографировать ветпаспорт» в первых шагах после анкеты.
- [ ] **DOC-3/05.** Признаки:
  - приложение шлёт `pet-documents` и `consent-editions`;
  - экран согласия берёт редакцию из `GET /consent`;
  - сборка без признаков (текущая в сторах) работает как раньше.
- [ ] **DOC-3/06.** Тексты разрешений на камеру и фото в `app.json` говорят про документы и не обещают удаление хранимых файлов; установлен `expo-document-picker`; сборка проходит ревью Apple и Google.
- [ ] **DOC-3/07.** Проверено:
  - в симуляторе iOS;
  - на iPhone (камера, многостраничная съёмка);
  - на Android (Xiaomi Pad 6): съёмка, PDF, проверка, сохранение.

Готово, когда: все пункты приняты, отчёт `docs/verification/documents-03.md`.

### Task 12: Съёмка и загрузка в приложении

**Files:**
- Create:
  - `apps/mobile/src/features/documents/{pick-pages.ts, prepare-page.ts, document-upload.ts, document-api.ts}` и тесты;
  - экраны `apps/mobile/app/(tabs)/pets/[id]/documents/{index,new,[docId]}.tsx`.
- Modify:
  - `apps/mobile/package.json` (`expo-document-picker` через `npx expo install`);
  - `app.json` (тексты разрешений);
  - `apps/mobile/app/(tabs)/pets/[id]/index.tsx:197-220` (строка «Документ» под `writable.includes('documents')`);
  - `packages/shared/src/api-client.ts` (методы документов, признаки `pet-documents`, `consent-editions`);
  - `apps/mobile/src/i18n/{ru,en}.ts`.

Образцы: `apps/mobile/src/lib/photo-io.ts` (`preparePhoto`), `checks/photo-upload.ts` (PUT через `expo/fetch`).

- [ ] **Step 1: Тесты:**
  - `prepare-page resizes to 2000 jpeg 0.8`;
  - `pick-pages refuses a 9th page`;
  - `pick-pages refuses mixing pdf and photos`;
  - `upload completes after all PUTs and reports a failed PUT`;
  - `api client sends pet-documents and consent-editions`.
- [ ] **Step 2:** FAIL → реализовать → PASS (`npm run test --workspace @lapka/mobile`, `npm run typecheck`).
- [ ] **Step 3:** Commit `Mobile: document upload`.

### Task 13: Экран проверки, согласие и первые шаги в приложении

**Files:**
- Create: `apps/mobile/src/features/documents/{RecognizeButton.tsx, ReviewScreen.tsx, ReviewEntry.tsx}`, экран `documents/[docId]/review.tsx`
- Modify:
  - экран согласия (`apps/mobile/src/features/consent/*`): версия из `GET /consent`;
  - `first-steps.tsx` (карточка);
  - карточки записей («Из документа»);
  - пустые разделы.

Правка записи переиспользует `ProductInput.tsx` и правила `event-form.ts` и `medications.ts`.

- [ ] **Step 1: Тест** `consent screen sends the version from GET /consent`. Правила экрана проверки уже покрыты тестами `packages/shared`.
- [ ] **Step 2:** FAIL → реализовать → PASS.
- [ ] **Step 3:** Симулятор iOS на staging: полный путь «паспорт → проверка → сохранение», английский, крупный шрифт. Устройства — по DOC-3/07, ручные шаги на телефоне делает владелец.
- [ ] **Step 4:** Отчёт `docs/verification/documents-03.md`; commit `Mobile: document review`.

---

## Самопроверка плана

- **Покрытие спеки:**
  - хранение — Tasks 2–5;
  - распознавание и сопоставление — Task 7;
  - экран проверки — Tasks 9 и 13;
  - кредиты — Task 7;
  - согласие и политика — Task 10;
  - удаление — Task 3 (документ, питомец, аккаунт) и Task 8 (записи остаются);
  - гейтинг старых сборок — Tasks 1, 4, 10, 12;
  - журнал токенов — Task 7;
  - PDF-сводка без документов — Task 8;
  - проверка симптомов не меняется — ничего не трогаем, `analysis-context` читает подтверждённые записи как обычно;
  - роадмап — Task 6.
- **Порядок:** DOC-1 выходит сам. DOC-2 зависит от DOC-1 и от утверждения текстов (Task 10) и набора документов (Task 11). DOC-3 зависит от DOC-2.
- **Открыто по спеке (решает исполнитель):**
  - библиотека PDF — предложена `pdf-lib`, проверить;
  - форма строки `credit_ledger` для документа;
  - точная форма части `file` в SDK.
