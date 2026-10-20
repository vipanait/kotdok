# FB-4: фото питомца — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** У питомца есть своё фото. Оно хранится в приватном бакете Supabase, показывается в карточке и списке и уходит вместе с питомцем и аккаунтом.

**Architecture:** Повторяем схему фото проверок (подписанный PUT напрямую в хранилище, проверка байтов на сервере), но в отдельном бакете `pet-avatars`, который не трогает очистка. Сервер хранит путь в `pets.avatar_path` и отдаёт короткоживущую подписанную ссылку на чтение `avatar_url`, только клиенту с признаком `pet-avatar` в `X-Lapka-Features` (тот же механизм, что `pet-dates`). Ветка — поверх `feature/fb-3`, в тот же выпуск.

**Tech Stack:** Supabase Storage, Next.js API (`apps/web`), Zod-контракты, Expo (`expo-image-picker`, `expo-image-manipulator`), Vitest.

**Spec:** [mobile-api-plan.md → «Этап FB-4. Фото питомца»](../../mobile-api-plan.md#этап-fb-4-фото-питомца).

## Global Constraints

- Бакет приватный, политики на `storage.objects` нет — доступ только через сервер (как `check-photos`).
- Лимиты — из `PHOTO_LIMITS` (5 МБ, сторона до 4096, JPEG/PNG/WebP); на телефоне сжатие до 1024 по длинной стороне, JPEG 0.8.
- Новые поля питомца не уходят клиентам без признака в `X-Lapka-Features` (сборки из сторов строгие).
- `packages/*` без Next.js и серверных SDK. Перед кодом в `apps/web` читать `node_modules/next/dist/docs/`.
- Миграцию на прод накатывает владелец до слияния; `supabase config push` — никогда.

## Review Focus

1. **Чужой путь при подтверждении.** Клиент присылает путь другого пользователя или питомца — 404, ничего не меняется. Тест — Task 2.
2. **Замена фото.** Старый объект удаляется после того, как новый записан в `avatar_path`; при сбое удаления фото всё равно сменилось. Тест — Task 2.
3. **Брошенная загрузка.** Получил ссылку и не подтвердил — объект без `avatar_path` удаляется очисткой (старше 3 часов, путь не в `pets`). Тест — Task 2.
4. **Удаление аккаунта при живых фото.** Шаг `photos` чистит оба бакета. Тест — Task 3.
5. **Ссылка истекла, пока открыт экран.** Картинка не грузится — показывается рисунок, при следующем чтении питомца ссылка новая. Проверка вручную — Task 5.

---

### Task 1: Миграция

**Files:** Create `supabase/migrations/20261021100000_pet_avatars.sql`.

- [ ] Бакет `pet-avatars` (private, 5 МБ, jpeg/png/webp), `alter table pets add column avatar_path text` (unique where not null), RPC `stale_avatar_objects(p_cutoff timestamptz, p_limit int)` — объекты `pet-avatars` старше `p_cutoff`, чьего имени нет в `pets.avatar_path`.
- [ ] `npx supabase db reset` → stop/start → проверить колонку и бакет SQL-запросом.

### Task 2: Сервер — загрузка, подтверждение, удаление

**Files:** Create `apps/web/src/server/pets/avatar-service.ts`, `apps/web/src/app/(backend)/api/v1/pets/[id]/avatar/route.ts`; modify `packages/contracts/src/pet.ts`, `apps/web/src/server/pets/pet-contract.ts`, `packages/shared/src/api-client.ts`, cron-маршрут фото; test `apps/web/tests/integration/feedback-04.test.ts`.

**Interfaces:**
- Контракт: `PET_AVATAR_FEATURE = 'pet-avatar'`; `PetSchema` + `avatar_url: string | null` (default null); `AvatarGrantRequestSchema { content_type, size_bytes }`, `AvatarGrantSchema { path, url, method: 'PUT', headers, expires_at }`, `AvatarConfirmSchema { path }`.
- `POST /api/v1/pets/:id/avatar` → 201 `AvatarGrant` (путь `${userId}/${petId}/${uuid}`).
- `PUT /api/v1/pets/:id/avatar` `{ path }` → скачивает, `verifyPhoto`, пишет `avatar_path`, удаляет прежний объект → 200 `Pet`.
- `DELETE /api/v1/pets/:id/avatar` → удаляет объект и обнуляет `avatar_path` → 200 `Pet`.
- `toPetContract` + `avatarUrl(supabase, path)` → `createSignedUrl(path, 3600)`; `petFor` убирает `avatar_url` без признака `pet-avatar`.
- api-client: `X-Lapka-Features: pet-dates,pet-avatar`; `requestAvatar`, `confirmAvatar`, `removeAvatar`.

- [ ] Тесты: полный цикл (grant → PUT байтов → confirm → `avatar_url` читается); confirm с чужим путём → 404; файл не картинка → 400; замена удаляет старый объект; DELETE; без признака — нет `avatar_url`; очистка удаляет неподтверждённый объект старше 3 часов и не трогает подтверждённый.
- [ ] FAIL → реализация → PASS, коммит.

### Task 3: Удаление вместе с питомцем и аккаунтом

**Files:** `apps/web/src/server/pets/pet-service.ts` (`softDeletePetAndChecks`), `apps/web/src/server/uploads/photo-storage.ts` (`removeUserPhotos` — оба бакета); тесты в `feedback-04.test.ts` и `deletion-*.test.ts`.

- [ ] Тесты: удаление питомца удаляет объект; шаг `photos` удаления аккаунта чистит `pet-avatars/<user>/`.
- [ ] FAIL → реализация → PASS, коммит.

### Task 4: Приложение

**Files:** `apps/mobile/src/features/pets/pet-avatar.ts` (+ тест), `apps/mobile/src/lib/photo-io.ts` (`prepareAvatar`), `src/ui/Card.tsx` (`Avatar` принимает `uri`), `app/(tabs)/pets/index.tsx`, `pets/[id]/index.tsx`, `pets/[id]/edit.tsx`, i18n.

**Interfaces:** `uploadAvatar(deps, petId, photo: PickedPhoto): Promise<Pet>` — prepare (1024, JPEG 0.8) → `requestAvatar` → `putPhoto` → `confirmAvatar`.

- [ ] Тест `uploadAvatar` на подставных зависимостях: порядок вызовов, ошибка PUT не вызывает confirm.
- [ ] Анкета: над полями — фото или рисунок, «Сменить фото» (галерея или камера) и «Убрать фото»; в карточке и списке `Avatar` с `uri`, при ошибке загрузки — рисунок.
- [ ] `app.json`: тексты разрешений — «чтобы показать фото питомца в карточке и отправить фото на проверку симптомов; фото проверок удаляются сразу после анализа».
- [ ] tsc и тесты → коммит.

### Task 5: Симулятор, отчёт

- [ ] Новая dev-сборка (меняется `app.json`): `npx expo run:ios`.
- [ ] Сценарии: добавить фото → карточка и список; заменить; убрать; удалить питомца → объекта нет; Review Focus 5.
- [ ] `docs/verification/feedback-04.md`, строка в README, отметки в roadmap. Коммит, финальное ревью отдельным агентом.
