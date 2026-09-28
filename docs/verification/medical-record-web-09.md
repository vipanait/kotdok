# MW-09: доработки после приёмки (веб, телефон, сервер)

Статус: **закрыт с оговорками**. Все пункты плана [09.md](../plans/medical-record-web/09.md) сделаны и проверены на локальном стеке. Оговорки:
- 4 миграции применены только к локальной базе. Владелец применяет их `supabase db push` на staging, затем на production, **до слияния** (раздел «Миграции для владельца»).
- Не закрываются кодом, как и сказано в плане: Safari на Mac, настоящий экранный диктор, `verify.mjs` в CI.
- Мелкие отложенные замечания ревью, которые видит владелец, перечислены в конце.

Дата: 27 сентября 2026. Ветка `feature/medical-record-web` (PR #53), база этапа — `80a5979` (план). Ветка отправляется контроллером после итогового ревью. В `main` ничего не влито, staging и production не изменялись.

## Коммиты

| Задача | Коммиты | Что |
|---|---|---|
| Task 1 — сервер и данные | `f0f12b0`, раунд 1 `51b119b` | 4 миграции, гонки, ключ «Сделано», очистка, порядок курсов, ключ веса, «Уточнить», день владельца у курса |
| Task 2 — день владельца, 404, API | `e40d786`, раунд 1 `e4e7ffe` | `?today=` там, где был UTC; настоящие HTTP 404; возврат после входа и согласия; OpenAPI 401; неизвестный код ошибки; строка срока по §7.1 |
| Task 3 — веб: формы и медкарта | `fdb7f58`, раунды `7a4d503`, `8c4557e` | подтверждение «Сделано», возврат к источнику, «Назад» браузера, фоновое обновление и полночь, запасной интервал, вес, возраст 0 |
| Task 4 — печать | `83268e5`, раунд 1 `7168570` | проверки одной строкой, Мурка на одном листе, дисклеймер, имя PDF и заголовки в Safari |
| Task 5 — телефон | `8c5e38b` | начало курса, «сохранится завершённым», длины визита, `heldReadOnly`, заголовок и ссылка заблокированной записи |
| Task 6 — код, тесты, инструменты | `c6a3f43`, `0ee67b1`, `e3dcba0`, `9ffc568`, `ccc1458` | флаги этапов убраны, дубли, компонентные тесты, пробелы тестов, `verify.mjs` от сегодняшнего дня, 200 % |
| Task 7 — отчёт и приёмка | `e690a53` (код), `49c5d0b` (отчёты), раунд исправлений 1 (порядок выпуска, повторный прогон скриптов, `medical-record-web-08/verify.mjs`) | фокус не прячется под закреплёнными панелями ≤760 px, мелкая чистка, повтор миграций с нуля, `next build`, отчёты, PR |
| Волна исправлений итогового ревью | `0eac8ec` (код, тесты, доказательства) и коммит этого раздела | «Уйти» в форме — первой записи вкладки, ссылка «Перейти к содержимому», диалог «Сделано» держит форму, `&from=form` с историей, «Состоялся» из «Всех сроков», телефон: вес после повторного ключа и повтор «Завершить курс», комментарии и OpenAPI (раздел «Волна исправлений итогового ревью») |

Отчёты исполнителей и ревью — `.superpowers/sdd/09/` (`task-N-report.md`, `progress.md`, вне git).

## Окружение

- Локальный Supabase (`127.0.0.1:54321`, Postgres `127.0.0.1:54322`, образ `supabase/postgres:17.6.1.166`). Миграции этапа применены только к нему.
- Сайт — `next dev -p 3100` с `apps/web/.env.integration` (конфигурация `web-local`, Next 16.3.4). Сборка — `next build` с теми же переменными.
- Chrome 153.0.8010.54 через Playwright, `ru-RU`, `Europe/Moscow`.
- iOS Simulator: iPhone 17e, iOS 26.5 — Safari (печать, Task 4) и dev-сборка приложения (Task 2, 5, 6).
- Данные: фикстурные владельцы `owner-a@fixture.local` и `owner-b@fixture.local` (`apps/web/tests/integration/fixtures.ts`); демо-питомцы «Мурка», «Бобик», «Барон…» — `apps/web/scripts/seed-medical-record-demo.mjs`. Пароли в отчётах не приводятся. В симуляторе вход был по magic link локального стека, без ввода пароля.

Доказательства лежат в [`medical-record-web-09/`](medical-record-web-09/), дальше в тексте эта папка обозначена `09/`.

## Пункт плана → доказательство

### Task 1: сервер и данные — миграции

| Пункт | Сделано | Доказательство |
|---|---|---|
| Гонка «прочитать и записать»: условие статуса внутри SQL, отказ `record_done` в той же транзакции | `update_health_event`, `update_visit`: `status = 'planned'` внутри `update` при `p_refuse_done` → `LP409` → 409 `record_done`. `change_pet_medication(p_over_by)` — курс, завершённый по дню, если изменение что-то меняет. Всё под `lock_own_pet`. `refuseDoneChange` остаётся для понятного ответа (`f0f12b0`). Отказ включается параметром `p_refuse_done default false`, поэтому сервер production до слияния работает как раньше (`51b119b`, решение контроллера) | `medical-record-web-09.test.ts`, «a done record is refused inside the write…»: четыре детерминированных гонки (план, позиция плана из нескольких, визит, курс). Второе соединение держит блокировку, PATCH ждёт внутри SQL → 409 `record_done`, запись не изменена. 8 раундов настоящих параллельных «Сделано» + PATCH: 200 или 409, никогда 500. «the production server (origin/main) still edits done records by its old argument list». Проверено, что тест ловит ошибку: со старой функцией он падает (отчёт Task 1) |
| `complete_health_item`: ключ и у плана из одной позиции; тот же ключ с другими данными → 409, с теми же → прежний ответ | Колонки `complete_key`, `complete_hash`; `health_event_by_key` ищет в обоих ключах (`f0f12b0`) | ««Сделано» on a plan of one item keeps its own key» (2 теста); `medical-record-web-04.test.ts` обновлён (повтор с другим днём → 409) |
| «Сделано»: пустое, явно переданное, очищает; «не передано» ≠ «пусто»; формы и подсказка «останется из плана» | `null` или отсутствие поля → остаётся текст плана (так шлют установленные сборки), `''` → очистить. Веб `readCompletion` шлёт `''`, подсказка «останется из плана» убрана. Телефон стартует с заметки плана и шлёт `''` за опустошённое поле. OpenAPI описывает это точно (`f0f12b0`, `51b119b`) | ««Сделано» tells an emptied field from one not sent» (3 теста). Форма без подсказки: `09/complete-form-{1440,390}.png` |
| `pet_medications`: позиция в пакете; повтор пакета — в порядке ввода; тест MW-05 снова проверяет порядок | `batch_position`, повтор по ключу `order by batch_position` (`f0f12b0`). `listMedications` сортирует и по позиции: курсы одного пакета с одной датой начала больше не идут вразнобой в `GET /health` (`e3dcba0`) | `medical-record-web-05.test.ts`: пакет из 5, повтор — те же id в том же порядке; порядок в `GET /health` |
| Вес: необязательный `Idempotency-Key` у POST/PATCH, клиент API, веб и телефон держат ключ; повтор после смены дня не создаёт второго измерения | Таблица `pet_weight_requests` (service-only, RLS, каскады), `remember_weight_key`, SQLSTATE `LPKEY` → 409 `conflict` с `details.reason = idempotency_key_reused`. Контракт `IDEMPOTENCY_KEY_REUSED` и OpenAPI — аддитивно. `addWeight`/`changeWeight(…, key?)`; веб `useSaveKey()`, телефон — ключ на открытие листа (`f0f12b0`, `51b119b`) | «a weight save with an Idempotency-Key» (5 тестов): повтор «после полуночи» → 409, строк 1; тот же ключ у другого питомца, в том числе одновременно → 409, не «дата занята»; неверный ключ → 400. `packages/shared/src/api-client.test.ts` (заголовок) |
| «Уточнить» у веса анкеты без истории: дата переносит значение, а не оставляет две строки | Пока истории нет, первое измерение с тем же значением — это вес анкеты с датой: одна строка. «Уточнить» ведёт на `health/new?type=weight&from=form`, форма открывается со значением анкеты и пустой датой (`f0f12b0`) | ««Уточнить» on the form’s weight with no history» (2 теста). Снимки `09/task7-weight-form-origin-{390,1440}.png` и `09/task7-weight-dating-form-{390,1440}.png`: «28», пустая дата, «Вес из анкеты. Укажите дату, когда он был таким.» (`09/task7-screens-output.json`, `dating`) |
| Завершённый курс по дню владельца: необязательный `today` у изменения курса; без него — прежнее окно | `?today=` в окне `clientToday`; `courseOverBy` берёт **позднее** из дня владельца и прежнего окна, то есть день владельца только ужесточает (`51b119b`). Веб и телефон передают `today` | «a course is finished by the owner’s day when the app sends it» (5 тестов): восток, запад («вчера» не открывает курс), день вне окна, без дня |
| Приёмка: интеграционные тесты, в том числе параллельные; миграции на локальной базе с демо и фикстурами; список файлов для владельца | — | `medical-record-web-09.test.ts` — 24 теста. Миграции применены к локальной базе с данными (Task 1) и **повторены с нуля** в одноразовой базе (Task 7, ниже). Список — «Миграции для владельца» |

### Task 2: день владельца, статусы 404, API

| Пункт | Сделано | Доказательство |
|---|---|---|
| Где день шёл по UTC: `GET /health` (`pet.medications`), `p_today` синхронизации списка анкеты, контекст анализа — необязательный день владельца; веб и телефон его шлют | `requestToday(url)` = `clientToday(?today=)`. Параметр `today` у GET health, POST/DELETE/PATCH medications, POST/PATCH visits, POST items/medication, POST /checks; `/api/symptom-check` сайта. Клиент API — необязательный последний аргумент. Веб — день страницы, телефон — `localToday()` в 14 вызовах `getHealthOverview` и 6 записях (`e40d786`) | `medical-record-web-09-owner-day.test.ts` (12 тестов): восток и запад UTC, сводка, хранимый список после каждой записи, `loadAnalysisContext`, POST /checks передаёт день. Проверено, что тест ловит ошибку. Браузер: запрос `GET …/health?today=2026-09-27` (`09/task2-screens-output.json`) |
| Настоящий HTTP 404: несуществующая запись своего питомца, `?check=` чужой проверки, `/checks?pet=<чужой/удалённый>` | Страницы со скелетом перенесены в группу `pets/[id]/(pet)/`, а `health/[recordId]/…` и `health/new` оставлены без `loading.tsx` над ними. `notFound()` срабатывает до потока. `/checks` проверяет питомца до Suspense (`e40d786`) | `09/http-status.mjs` → `09/http-status-output.json`: все строки «было 200 + noindex» стали **404**, `/edit` сделанной записи → **307**. Снимки `09/missing-record-404-{320,390,1440}.png`. `next build` (Task 7) собирает эту структуру маршрутов без ошибок |
| Возврат после входа и согласия на исходную подстраницу | Прокси ставит `x-lapka-page` (клиентское значение перезаписывается), `petReturnPath` принимает только страницу этого питомца (`e40d786`) | `09/consent-next-edit-1440.png`, `09/consent-back-on-edit-1440.png` (после согласия — анкета, не медкарта). `tests/server/security/page-path.test.ts`, `proxy-page-path.test.ts` (поддельный заголовок перезаписан, `e4e7ffe`) |
| OpenAPI: `reauth_required` (401) у `POST /account-deletion` и где общий 401 его затирал | Один ответ 401 называет `unauthorized` и `reauth_required` (`e40d786`) | `tests/unit/contracts/openapi.test.ts` |
| Клиент API: неизвестный код не превращается в `internal_error` | `ApiErrorEnvelopeReadSchema` нестрогая, `ApiError.code` хранит код сервера. Телефон `apiMessages: Record<ErrorCode,string>`, незнакомый код — слова экрана (`e40d786`, `e4e7ffe`) | `packages/shared/src/api-client.test.ts` (+5), `apps/mobile/src/lib/errors.test.ts` |
| «Сроки» (`/pets/due`): вид визита, строка называет срок по §7.1 | `visit_kind` в `DueItem`, аддитивно; общее правило `dueName`. «Обработка от блох и клещей — просрочено», «Визит к врачу: осмотр — через 2 дня». Статус не обрезается на узком экране (`e40d786`, `e4e7ffe`) | `09/pets-due-lines-{320,390,1440}.png`, `09/dashboard-due-lines-{320,390,1440}.png`, `09/ios-app-pets-due-lines.png`; `record-overview.test.ts` (`dueName`), `due.test.ts` телефона; `statusWhole: true` на всех ширинах (`09/task2-screens-output.json`) |

### Task 3: веб — формы и медкарта

| Пункт | Сделано | Доказательство |
|---|---|---|
| «Сделано»: отдельное подтверждение; подсказка следующей даты без несуществующего предложения; предупреждение без «препараты» | `ConfirmDialog` с позицией и датой, первый фокус на «Проверить ещё раз». `nextHintText` пишет «Предложено…», только когда предложенная дата стоит в поле. Текст `completeForm.doneWarning` (`fdb7f58`, `7a4d503`) | `09/complete-form-{1440,390}.png`, `09/complete-confirm-{1440,390}.png`; `treatments-due.test.ts`, `vaccinations.test.ts`; `09/task3-screens-output.json` (`complete1440`) |
| После сохранения — к разделу/источнику с уведомлением, запись открывается из уведомления | `withSaved(href, saved, recordId)`, ссылка «Открыть запись» в `SavedNotice` (`fdb7f58`; решение контроллера, отменяет отклонение MW-03) | `09/complete-saved-due-1440.png`, `09/complete-saved-plan-390.png`, `09/vaccine-saved-section-{1440,390}.png`; прогоны `verify.mjs` MW-03…06 с новыми переходами (`09/task3-mw03-verify-output.json`, `09/task6-mw0{4,5,6}-verify-output.json`) |
| «Назад» браузера в изменённой форме спрашивает | Одна копия записи формы в истории, `createBackGuard` / `createLeaveGuard` без React; после перезагрузки копия узнаётся по ключу записи Navigation API; при пересоздании формы копию принимает только первая защита в документе (`fdb7f58`, `7a4d503`, `8c4557e`) | `back-guard.test.ts` (9), `leave-guard.test.ts` (12, проверено, что тесты ловят ошибку); `09/back-guard-{1440,390}.png`, `09/back-stay-focus-{1440,390}.png`, `09/take-latest-{1440,390}.png`; `09/task3-fix1-output.json`, `09/task3-fix2-output.json` |
| Открытая форма изменения не пересоздаётся при фоновом обновлении; «сегодня» переходит через полночь; день карточки «История проверок» — от дня страницы | `holdRecord`/`takeFresh` + баннер `DriftNotice` в постоянной live-области. `useToday` — таймер до полуночи, `focus`/`visibilitychange`; `useMedicalRecord` перечитывает медкарту в новый день. Курс, завершившийся в полночь, — текст `drift.ended`. `checkDayOf` в карточке (`fdb7f58`, `7a4d503`) | `held-record.test.ts`, `today.test.ts`; `09/drift-notice-{1440,390}.png`, `09/drift-live-{1440,390}.png`, `09/midnight-weight-form-{1440,390}.png` («Через 6 дней» → «Через 5 дней» без перезагрузки, часы Playwright) |
| Экран «История проверок питомца» по макету pet-history | Уже есть с MW-06: `/checks?pet=<id>`, на него ведёт «Все» из карточки. Отличие от макета — группы по месяцам, как в общей «Истории» | `09/pet-history-{1440,390}.png`; чужой питомец → HTTP 404 (Task 2) |
| Удаление позиции не открывает поиск; ссылка баннера ≥ 44 px | Фокус на соседнюю позицию, иначе на группу (`fieldset tabIndex=-1`); ссылки баннера, уведомления и `health-drift` 44 px (`fdb7f58`) | `09/task3-screens-output.json` (`ownName*`, `bannerLink*`: высота 44) |
| Своё название без интервала — запасной интервал, как телефон | Общее `suggestionInterval` (`packages/shared`), веб `followSuggestion`, «Сделано» (`fdb7f58`) | `09/vaccine-own-name-{1440,390}.png` (2027-09-27, «по обычному интервалу: 1 год»); `event-entry.test.ts`, `vaccinations.test.ts` |
| Английский: месяц в доступном имени «Сделано» не в нижнем регистре | `statusInSentence` меняет регистр только первого слова статуса (`fdb7f58`) | `treatments-due.test.ts` («September 12», «March») |
| Курс: нейтральный текст, когда сервер не принимает запись лекарств | `readOnlyBody` «Курс сохранён в медкарте. Изменить его сейчас нельзя.» (`fdb7f58`) | `medications.test.ts` |
| Вес: смена периода объявляется (постоянная live-область); вес анкеты с двумя знаками переносится на дату без изменения (общее правило) | `periodAnnouncement` в постоянной `aria-live`; общее `parseWeightKeeping` — веб и телефон (`fdb7f58`) | `weight-page.test.ts`, `weight-entry.test.ts`; `09/task3-screens-output.json` (`weightAndHistory*`); `weight-form.test.tsx` (4,25 в форме датирования, Task 6) |
| Возраст 0 — одинаково с телефоном | «0 лет» везде: общее `headAge` в шапке, сводке, списке питомцев и строке формы проверки, веб и телефон (`fdb7f58`, `7a4d503`) | `view-model.test.ts`, `pet-summary.test.ts`, `overview.test.ts` телефона |

### Task 4: печать сводки

| Пункт | Сделано | Доказательство |
|---|---|---|
| Проверки в сводке — одной строкой (§7.17) | В печати `line-clamp: 1` по целым словам (`Words`), разделитель « · ». На экране — полный текст (`83268e5`) | `09/task4-print-output.json` (`lines: 1` у каждой проверки на ширине A4), `09/task4-pdf-check-output.json` (`checks_as_printed`, Chrome и Safari); `09/task4-*-checks-screen-{1440,390}.png`, `09/task4-*-print-view-a4.png` |
| «Мурка» на одной странице A4, если данные позволяют | Печать плотнее, ничего не убрано (`83268e5`) | Chrome: Мурка 1 стр. (было 2), Бобик 1, Барон 6 (было 7) — `09/chrome-*.pdf`, `09/chrome-murka-p1.png`. Safari iOS: Мурка 2 стр. (решение контроллера — iOS печатает ×1,2) |
| Подвал в Chrome не дублируется на последней странице; дисклеймер остаётся в браузерах без полей страницы | Строка дисклеймера в потоке под заголовком печатается всегда; копия в полях страницы (`@bottom-left`) осталась; закрывающий подвал экрана не печатается (`7168570`, решение контроллера) | `09/task4-pdf-check.py` с проверками (выход 1 при нуле копий, пустой странице, одиноком заголовке): `_assertions.failures: []`. Копии по страницам: Chrome с полями `[2]`/`[2,1,1,1,1,1]`, без полей `[1]`/`[1,0,0,0,0]`, Safari `[1,0]`/`[1,0,…]` |
| Safari iOS: имя PDF не теряет «.2026»; заголовок раздела не внизу страницы | Причина — обрезка заголовка до 80 символов, а не «расширение». `fileTitle` ≤ 80, режется только имя, по графемам (`83268e5`, `7168570`). В WebKit короткие таблицы печатаются целиком, у визитов заголовок раздела внутри первой записи | Simulator: `Мурка — медкарта — 27.09.2026.pdf`, `Барон Мурлыкенштейн фон Длиннохвостов-Пушистиков Третий — медкарта — 27.09.2026.pdf`; `09/ios-safari-murka-share-name.png`; `headings_alone_at_foot: []` (`09/ios-safari-*.pdf`, `09/ios-safari-*-pN.png`); `vet-summary.test.ts` (web и shared) |

### Task 5: телефон — паритет

| Пункт | Сделано | Доказательство |
|---|---|---|
| Дата начала нового курса обязательна (§7.12); пустая — только для курса из анкеты | Общее `startMayStayEmpty`: пустое допустимо, только если начала нет в данных (`started_on === null`; решение контроллера) (`8c5e38b`) | `09/ios-course-start-required.png`, `09/ios-course-form-start-unknown.png`; `course-entry.test.ts`, `medications.test.ts` телефона |
| Предупреждение «курс сохранится завершённым» | Общее `endsByToday`, текст как на вебе (`8c5e38b`) | `09/ios-course-ends-today.png` |
| Длины полей визита до отправки | `visitTextProblems`, числа из `VISIT_LIMITS`/`MEDICATION_LIMITS`, раздельные ошибки названия и инструкции (`8c5e38b`). Прокрутка к первой ошибке (`c6a3f43`, `ccc1458`). Длины прививки/обработки — `eventTextProblems` (`c6a3f43`) | `09/ios-visit-clinic-too-long.png`, `09/ios-task6-visit-first-error.png`, `09/ios-task6-visit-first-error-refocus.png`, `09/ios-task6-event-clinic-too-long.png`; `visits.test.ts` |
| `heldReadOnly` не обещает «добавить в лекарства», если нечего; заголовок заблокированной записи по виду; после «уже отмечено раньше» — ссылка на запись | `heldNote` → общее `prescriptionAddable` (`c6a3f43`); `setKind` до проверки «сделано»; «Открыть запись» через `router.replace` (`8c5e38b`); «Запись» до загрузки (`c6a3f43`) | `09/ios-visit-held-all-in-medicines.png`, `09/ios-visit-held-can-add.png`, `09/ios-task6-held-visit-prescriptions.png`, `09/ios-locked-record-title.png`, `09/ios-task6-record-loading-title.png`, `09/ios-earlier-done-open-record.png`, `09/ios-earlier-done-record-opened.png`, `09/ios-task6-earlier-done-copy.png` |
| Вес с двумя знаками и возраст 0 — общие правила | Телефон использует `parseWeightKeeping` и `headAge`, своих копий нет | Сверка в отчёте Task 5; `overview.test.ts`, `WeightSheet.tsx:67` |

### Task 6: код, тесты, инструменты

| Пункт | Сделано | Доказательство |
|---|---|---|
| Убрать флаги этапов и ветки под них, включая `writable === null` | `stage.ts` → `routes.ts`, только маршрутизация; `writable` обязателен (`c6a3f43`) | typecheck; `next build` (Task 7) |
| Дубли: `useFocusOnMount`, `FormSkeleton`, UUID, `endsByToday`, `checkDay`, «сегодня/завтра/через N дней», `notFound()` вне JSX, подсказки анкеты параллельно, мёртвая ветка `PetSavedBanner` | Всё свёрнуто в одно место (`form-parts.tsx`, `UuidSchema`, `checkDayOf`, `soonText`, `NewRecordForm`, `Promise.all`), `PetSavedKind` без `updated` (`c6a3f43`) | Отчёт Task 6, таблица «Дубли»; web 515/515 |
| Компонентные тесты: форма веса, комбобокс справочника, печать, хук кэша медкарты, поля анкеты | `react-dom/server` + чистые модули; jsdom в проекте нет (`0ee67b1`) | `weight-form.test.tsx` (10), `catalog-combobox.test.tsx` (12), `vet-summary-print.test.tsx` (7), `medical-record-cache.test.ts` (7), `pet-form-fields.test.tsx` (7) |
| `splitCourses` при равных датах; MW-06: ключ прежней правки после «Состоялся» → `record_done`, PATCH `check_id` чужой проверки → 400 | (`e3dcba0`) | `record-overview.test.ts`; `medical-record-web-06.test.ts` |
| `verify.mjs` MW-04/05/06 от сегодняшнего дня; снимок шага 3 кроссплатформенного прогона | Даты сида от сегодняшнего дня; глобы маршрутов → RegExp с `?today=` (`e3dcba0`, `ccc1458`) | `09/task6-mw0{4,5,6}-verify-output.json` (exit 0 ×3); `09/crossplatform-{1,2a,2b,3}-*.png`, `09/task6-crossplatform-output.json` |
| Масштаб 200 % в Chrome: нет горизонтальной прокрутки и перекрытий на медкарте, формах и сводке | Скрипт `09/task6-zoom200.mjs` (`9ffc568`), в Task 7 дополнен проверкой фокуса | Прогон Task 7: 11 страниц × 2 окна (720×500 и 640×400 CSS px при DPR 2), горизонтальной прокрутки нет, перекрытий 0 (`09/task6-zoom200-output.json`, `09/zoom200-*.png`) |

### Task 7: отчёт и приёмка

| Пункт | Сделано | Доказательство |
|---|---|---|
| (решение по ревью Task 6) Фокус с клавиатуры не прячется под закреплёнными панелями ≤760 px (исключение — нижняя часть высокого многострочного поля, см. ограничения) | `html { scroll-padding-bottom }` при ≤760 px: навигация 66 px + 16 px; на медкарте с панелью «Добавить запись / Для врача» — 66 + 72 + 16 px (`e690a53`) | До правки скрипт находил фокус под панелями на медкарте, «Сроках», формах и странице визита: Chrome прокручивает к полю только до края окна. После: `focusHidden: []`, 358 остановок фокуса (`09/task6-zoom200-output.json`). 390 px: 24 остановки, ни одна не под панелями, нижняя — 16 px над панелью (`09/task7-screens-output.json`, `09/task7-record-focus-above-bars-390.png`). Снимки `09/zoom200-*-focus-low.png`. Оговорка про поле заметки — в разделе «Остающиеся ограничения» |
| (то же) Мелкая чистка | Комментарий `EventDayProblem` на месте, у `EventTextField` свой; двойные пустые строки в четырёх экранах (`e690a53`) | diff коммита |
| Миграции с нуля (решение контроллера) | Одноразовая база, все 46 файлов по порядку | Раздел «Повтор миграций с нуля» |
| `next build` (решение контроллера) | Сборка при работающем dev-сервере: в Next 16 у них разные каталоги | Раздел «Тесты и сборка» |
| Отчёт, итоговый отчёт, PR #53 | Этот файл; [итоговый отчёт](medical-record-web-final.md) (ограничения и чек-лист выпуска); поправка про «.2026» в [MW-07](medical-record-web-07.md); описание PR #53 | — |

## Миграции для владельца

Ветка добавляет ровно четыре файла (`git diff $(git merge-base origin/main HEAD)..HEAD --stat -- supabase/`: 4 файла, 786 строк):

1. `supabase/migrations/20260927100000_record_done_in_sql.sql` — отказ `record_done` внутри `update_health_event` / `update_visit` (по `p_refuse_done`) и `change_pet_medication` (по `p_over_by`).
2. `supabase/migrations/20260927110000_completion_key_and_clearing.sql` — ключ «Сделано» у плана из одной позиции, очистка клиники и заметки пустой строкой.
3. `supabase/migrations/20260927120000_medication_batch_position.sql` — `pet_medications.batch_position`, порядок повтора пакета.
4. `supabase/migrations/20260927130000_weight_keys_and_dating.sql` — `pet_weight_requests`, ключ веса (`LPKEY`), «Уточнить».

**Совместимость.** Новые параметры имеют значения по умолчанию, старые перегрузки удалены (`drop function if exists`), поэтому вызов по старому списку аргументов разрешается однозначно. Сервер production (`origin/main` `3a6bead`) после `db push` и до слияния работает как раньше: правки сделанных записей не превращаются в 500. Это проверяют тесты «an older server calling the functions as before still works» и «the production server (origin/main) still edits done records by its old argument list». Установленные сборки приложения новых полей не шлют и получают прежнее поведение, кроме двух изменений, которые SQL вносит сразу после `db push`, ещё со старым сервером:
- повтор «Сделано» с тем же ключом и другими данными у плана из одной позиции — 409 `conflict` вместо 200 со старой записью (ложного успеха нет);
- «Уточнить» по значению: у питомца без истории первое измерение с тем же значением, что в анкете, даёт одну строку (вес анкеты с датой), а не две — для любого клиента, в том числе установленных сборок.

**Шаги владельца** (в папке, где выбрана ветка `feature/medical-record-web`; агент `db push` не выполняет). **Выполнять по одной строке и остановиться при любой ошибке** или если вывод не совпадает с комментарием: неверный `project-ref` или лишние файлы в `--dry-run` — стоп, ничего не пушить.

```bash
cd /Users/skyeng/dev/petcheck/kotdok
git branch --show-current                  # должно быть feature/medical-record-web
cat supabase/.temp/project-ref             # на 27.09 — rclnsbivyulqmvujiopv (staging); если production — перелинковать

# 1. staging
supabase link --project-ref rclnsbivyulqmvujiopv
cat supabase/.temp/project-ref             # должно быть rclnsbivyulqmvujiopv — иначе стоп
supabase db push --dry-run                 # ровно 4 файла 20260927100000…130000; что-то ещё — стоп
supabase db push
supabase migration list                    # у четырёх файлов заполнена колонка Remote
# проверка только чтением (SQL Editor staging):
#   select to_regclass('public.pet_weight_requests');                          -- не null
#   select column_name from information_schema.columns
#     where table_schema = 'public' and (
#       (table_name = 'pet_medications' and column_name = 'batch_position') or
#       (table_name = 'pet_health_events' and column_name in ('complete_key', 'complete_hash')));
#     -- три строки: batch_position, complete_key, complete_hash
#   select proname, pg_get_function_identity_arguments(oid) from pg_proc
#     where proname in ('update_health_event','update_visit','record_pet_weight','change_pet_weight','remember_weight_key');
#     -- у update_health_event/update_visit есть p_refuse_done, у весов — p_key

# 2. production — то же самое
supabase link --project-ref bczseshsgpzulqynvukg
cat supabase/.temp/project-ref             # должно быть bczseshsgpzulqynvukg — иначе стоп
supabase db push --dry-run                 # те же 4 файла; что-то ещё — стоп
supabase db push
supabase migration list
# та же проверка только чтением в SQL Editor production

# 3. вернуть связь на staging
supabase link --project-ref rclnsbivyulqmvujiopv
cat supabase/.temp/project-ref             # должно быть rclnsbivyulqmvujiopv
```

Никогда не выполнять `supabase config push`: `config.toml` описывает локальный стенд. `supabase db reset` для этих шагов не нужен.

**Порядок выпуска** (решение контроллера): `db push` staging → проверка → `db push` production → проверка → проверка fingerprint (`npx expo-updates fingerprint:generate --platform ios` в `apps/mobile` против `runtime.version` установленной сборки) → EAS Update в канал `production` → слияние PR #53 (Vercel сразу выкладывает сайт и API в production) → проверка production. EAS Update — до слияния: новый JS работает со старым сервером и мигрированной базой (`today` — query-параметр, старые маршруты его не читают; заголовок ключа веса игнорируется, `p_key` = `null`; старая схема «Сделано» пропускает `''`, и после `db push` это очищает поле, как задумано; старый сервер не присылает `record_done`, а новый JS и так скрывает «Изменить» у выполненных записей), а обновление применяется только после перезапуска, так что публикация до деплоя уменьшает число устройств, где старый JS встретит `record_done`. Подробно — в [итоговом отчёте](medical-record-web-final.md), «Чек-лист выпуска».

## Повтор миграций с нуля (решение контроллера)

Зачем: в раунде исправлений Task 1 два файла миграций изменены на месте (`51b119b`). Локальная база получила их повторным применением, а здесь проверено, что вся цепочка применяется к пустой базе.

Что сделано (локальный Postgres, контейнер `supabase_db_kotdok` = `127.0.0.1:54322`, `psql` через `docker exec`, на Mac своего `psql` нет):
1. `create database mw09_replay` (роли Supabase общие для кластера).
2. Заглушки схем, которыми управляет Supabase. В голой базе нет `auth` и `storage`, а миграции ссылаются на `auth.users`, `auth.uid()`, `storage.buckets`, `storage.objects`. Поэтому схемы `auth` и `storage` скопированы **только структурой** из основной локальной базы: `pg_dump -U postgres -d postgres --schema-only -n auth -n storage --no-owner` (4860 строк). Из дампа удалена одна строка — триггер `on_auth_user_created` на `auth.users`. Его создаёт сама миграция `20260101000000_init_baseline.sql`, а функция `public.handle_new_user()` в пустой базе ещё не существует. Дамп применён ролью `supabase_admin`: как и в хостинге, эти схемы принадлежат ей, а `postgres` не суперпользователь и не может `ALTER DEFAULT PRIVILEGES` за `supabase_auth_admin`. Результат: 27 таблиц `auth`, 10 таблиц `storage`, данных нет.
3. Все 46 файлов `supabase/migrations/*.sql` по порядку ролью `postgres` (как `db push`), `psql -v ON_ERROR_STOP=1`: **46/46 без ошибок**.
4. Второй прогон с нуля (пересоздание базы, те же заглушки), каждый файл в одной транзакции (`psql -1`): **46/46**.
5. Сравнение с основной локальной базой: `pg_dump --schema-only -n public --no-owner --no-privileges` обеих баз. Совпадает всё, кроме пробелов в теле одной SQL-функции согласий из #51 (`coalesce(v in ('2026-09-26'), false)` одной строкой против трёх). Схема `public` из цепочки файлов та же, что у базы, в которую миграции вносились по одной.
6. `drop database mw09_replay`. После этого в кластере только `_supabase`, `postgres`, `storage_vectors` и шаблоны.

Hosted-проекты не затрагивались, `supabase db reset` не выполнялся. Права по умолчанию схемы `public`, которые на хостинге выставляют init-скрипты Supabase, в одноразовой базе не воспроизводились: проверялось применение и итоговая структура, а не гранты.

## Тесты и сборка (Task 7, на `e690a53`)

```
npm run typecheck                                    → exit 0 (mobile, web, contracts, shared)
npm run lint                                         → eslint, чисто
npm test                                             → web: Test Files 63 passed (63), Tests 515 passed (515)
npm test --workspace @lapka/shared                   → Test Files 12 passed (12), Tests 132 passed (132)
npm test --workspace @lapka/mobile                   → Test Files 42 passed (42), Tests 389 passed (389)
npm run test:integration                             → Test Files 46 passed (46), Tests 466 passed (466)
(apps/web) npx vitest run --config vitest.integration.config.mts tests/integration/fixtures.test.ts → Tests 5 passed (5)
node apps/web/scripts/seed-medical-record-demo.mjs   → exit 0 (демо после интеграционного прогона на месте)

(set -a; . apps/web/.env.integration; set +a; npm run build --workspace @lapka/web)
                                                     → exit 0: Next.js 16.3.4 (Turbopack), «Compiled successfully»,
                                                       TypeScript без ошибок, 53 статические страницы; все страницы
                                                       питомца, в том числе группа (pet) и health/[recordId]/…, — ƒ (динамические)
                                                       dev-сервер :3100 не останавливался и после сборки отвечает 200
                                                       (Next 16: dev пишет в .next/dev, build — в .next)
npm audit --audit-level=high                         → exit 0: high и critical нет; 17 moderate — @vitest/mocker,
                                                       decode-uri-component, uuid <11.1.1 в цепочке expo. Ветка
                                                       зависимостей не меняет: diff package-lock.json и package.json
                                                       с origin/main пуст

PLAYWRIGHT=… CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  node docs/verification/medical-record-web-09/task6-zoom200.mjs > …/task6-zoom200-output.json
                                                     → exit 0: 22 прогона (11 страниц × 2 окна), horizontalScroll false,
                                                       overlaps 0, focusHidden [], 358 остановок фокуса;
                                                       focusPartlyCovered — 3 поля заметки/причины (см. ограничения)
PLAYWRIGHT=… CHROME=… node docs/verification/medical-record-web-09/task7-screens.mjs > …/task7-screens-output.json
                                                     → exit 0: «Уточнить» Бобика — «28» и пустая дата на 390 и 1440;
                                                       медкарта 390 — 24 остановки фокуса, скрытых нет
```

Прогон интеграционного набора пересоздаёт фикстурных пользователей, поэтому после него запущены `fixtures.test.ts` и сид демо.

### Повторный прогон браузерных и HTTP-скриптов на HEAD (раунд исправлений 1 Task 7)

Task 6 изменил страницы, которые проверяют эти скрипты: убраны `notFound()` под флагами, перестроена `/health/new`. Поэтому скрипты задач 2–4 и MW-03, MW-08 прогнаны заново на `49c5d0b` (код тот же, что в `e690a53`). Перед каждым прогоном, который пишет в базу, и после последнего — сид демо. Выводы перезаписаны, снимки задач 2–4 пересняты. Снимки этапов MW-03 и MW-08 возвращены `git checkout`, чтобы не подменять доказательства тех этапов.

Сравнивались с прежними выводами после замены id, дат и `request_id`:

| Скрипт | Результат | Отличия от прежнего вывода |
|---|---|---|
| `09/http-status.mjs` → `09/http-status-output.json` | exit 0 | нет. Все 404, 200, 307 и `next=` согласия — как в таблице Task 2 |
| `09/task2-screens.mjs` → `09/task2-screens-output.json` | exit 0 | нет |
| `medical-record-web-03/verify.mjs` → `09/task3-mw03-verify-output.json` | exit 0 | нет |
| `09/task3-screens.mjs` → `09/task3-screens-output.json` | exit 0 | нет |
| `09/task3-fix1-screens.mjs` → `09/task3-fix1-output.json` | exit 0 | только `id` поля веса, созданный `useId` React (`_R_ppbn…` → `_R_2ppbn…`) — следствие перестройки `/health/new` |
| `09/task3-fix2-screens.mjs` → `09/task3-fix2-output.json` | exit 0 | нет |
| `09/task4-print.mjs` → `09/task4-print-output.json`, `09/chrome-*.pdf` | exit 0 | нет |
| `09/task4-pdf-check.py` → `09/task4-pdf-check-output.json` | exit 0, `_assertions.failures: []` | нет. PDF Safari (`ios-safari-*.pdf`) — из Simulator в Task 4, не переснимались |
| `medical-record-web-08/verify.mjs` → `09/task7-mw08-verify-output.json` | exit 0 после правки скрипта | только строка срока по §7.1: «Обработка от блох и клещей — просрочено» вместо «Блохи и клещи — просрочено» (Task 2) |

**Правка `medical-record-web-08/verify.mjs`.** Первый прогон упал: `form.course-form` не найден.
- Причина та же, что Task 6 нашёл в MW-05/06: с MW-09 сайт шлёт `?today=`, и глобы `**/api/v1/pets/*/health/medications` и `**/api/v1/pets/*/health` перестали перехватывать запросы. Сохранение курса «без сети» ушло на сервер и прошло.
- Глобы заменены на RegExp с необязательным query (`MEDICATIONS_URL`, `healthUrl`).
- Проверка «строка срока в одну строку» теперь смотрит на название (`.compact-pet-due-title`): с `e4e7ffe` многоточие у названия, а статус рядом не обрезается никогда. Высота строки по-прежнему < 24 px.

**Не повторялись:**
- `verify.mjs` MW-01, MW-02, MW-07. Их страницы в MW-09 проверены другими прогонами: медкарта, вес и формы — `task6-zoom200.mjs`, `task3-*.mjs`, `task7-screens.mjs`; сводка и печать — `task4-print.mjs`.
- MW-04/05/06 и crossplatform — прогнаны Task 6 на `e3dcba0`, уже после снятия флагов (`c6a3f43`). После них менялись только телефон (`ccc1458`) и CSS `scroll-padding`.
- Прогоны в iOS Simulator (Task 2, 4, 5, 6): изменения после них не касаются телефона и печати в Safari.

## Волна исправлений итогового ревью (`0eac8ec`)

Замечания итогового ревью MW-09 (ревью A — сервер/SQL/shared/телефон, ревью B — веб). Исправлено всё, что отобрал контроллер.

| Замечание | Что сделано | Где |
|---|---|---|
| B1 (важное). «Уйти» после «Назад» ничего не делало, если форма — первая запись вкладки (открыта в новой вкладке, из закладки, восстановленная вкладка): `history.go(-2)` вне истории браузер игнорирует, вопрос оставался открытым | Защита запоминает, есть ли запись перед формой: сразу после того, как положена копия, `history.length > 2` (push отбрасывает записи «вперёд», поэтому счёт точный; учитываются и записи других сайтов — `navigation.canGoBack` их не видит, форма из поисковика потеряла бы путь назад). Нет записи — `goBack` ничего не делает и отвечает `false`, а «Уйти» ведёт по ссылке «назад» самой формы (раздел или запись) через `router.replace` копии. Хук закрывает вопрос при `leave`. Все шесть форм передают свою ссылку назад | `features/forms/back-guard.ts`, `leave-guard.ts` (`backHref`), `use-leave-guard.ts` (`useLeaveGuard(dirty, backHref)`, `setLeaveHref(null)` в `leave`) |
| B-m1. Ссылка «Перейти к содержимому» (`#main`) добавляла запись поверх копии: «Назад» попадал на копию, защита спрашивала и клала вторую копию, «Уйти» возвращал на форму | Ссылка переводит фокус на `main` без записи в истории (без JS — обычный `#main`). Защита не принимает запись с пометкой копии за собственную запись формы (переход по `#…` поверх копии, набранный вручную) | `components/cabinet/SkipLink.tsx`, `CabinetShell.tsx`; `back-guard.ts` `popped` |
| B-m2. Открытое подтверждение «Сделано» не держало форму: фоновая перезагрузка пересоздавала её и закрывала вопрос | Форма держит запись, пока открыт вопрос, даже без изменений (`completeHolds`) | `events/complete-form.ts`, `CompleteScreen.tsx` |
| B-m3. `&from=form` при истории веса подставлял последнее измерение как «Вес из анкеты» | Значение анкеты передаётся, только если у питомца нет ни одного живого измерения (`hasWeightHistory`) | `server/medical-record/weight-service.ts`, `app/(frontend)/pets/[id]/health/new/page.tsx` |
| B-m4. «Состоялся» из «Всех сроков» возвращал `saved=completed` — «Отмечено сделанным» у визита | Возврат с `saved=held`, «Все сроки» читают оба значения и говорят «Визит отмечен состоявшимся» | `routes.ts` `visitPlanDoneHref`, `DueScreen.tsx`, `health/due/page.tsx` |
| A-m1. Телефон: после «уже сохранено» (ключ использован) закрытие листа веса не перечитывало список | Закрытие листа любым способом после такого ответа перечитывает список (`onSaved`); разбор ошибки — `weightSaveFailure` | `apps/mobile/src/features/medical-record/WeightSheet.tsx`, `weight.ts` |
| A-m2. Комментарии миграции `20260927110000`: «null оставляет текст плана» неверно для заметки плана из нескольких позиций | Комментарии исправлены (только текст; миграция нигде, кроме локальной базы, не применена, повторно применять не нужно). Та же неточность исправлена в комментарии `event-service.ts` | `supabase/migrations/20260927110000_completion_key_and_clearing.sql`, `server/medical-record/event-service.ts` |
| A-m4. `today` у PATCH medications в OpenAPI без описания | Свой параметр `courseDayParam` с описанием (окно дня, ужесточение правила завершения, список анкеты); `docs/api/openapi.yaml` перегенерирован | `packages/contracts/src/openapi.ts` |
| A-m5a. `courseFinished` повторял правило текущего курса | `!isCurrentCourse(course, overBy)` из `@lapka/shared` | `server/medical-record/medication-service.ts` |
| A-m6. Телефон: повтор «Завершить курс» после полуночи отправлял новый конец | До ответа сервера повтор отправляет день первой попытки (`endCourse`); сервер отвечает 200 и курсом («ничего не меняет»). `record_done` по-прежнему — перечитать курс, без ошибки. До исправления ошибки владелец тоже не видел (экран перечитывал курс), но полагался на отказ | `apps/mobile/src/features/medical-record/medications.ts`, `app/(tabs)/pets/[id]/medication/[medicationId].tsx` |

Тесты волны:
- `back-guard.test.ts`: история в миниатюре, как браузер, игнорирует `go` вне диапазона; форма — первая запись вкладки; страница другого сайта перед формой; записи «вперёд» перед вводом; переход `#main` поверх копии.
- `leave-guard.test.ts`: первая запись вкладки — «Уйти» ведёт по ссылке назад и убирает копию; «Уйти» до возврата копии; после перезагрузки на копии; с записью перед формой — по-прежнему назад.
- `treatments-due.test.ts`: `visitPlanDoneHref` из «Всех сроков» — `held`; `completeHolds`.
- Телефон: `medications.test.ts` — повтор после потерянного ответа до и после полуночи, первая попытка не дошла, `record_done`, другой отказ; `weight.test.ts` — `weightSaveFailure`.
- Интеграция (`medical-record-web-09.test.ts`): `hasWeightHistory` (нет истории, есть, чужой владелец, удалённые) и «Завершить курс» после полуночи с концом первой попытки — 200, с новым концом — 409 `record_done`.

Браузер, Chrome через Playwright, 1440 и 390 px — `09/final-fix-screens.mjs`, вывод `09/final-fix-output.json`:
- форма веса и новая прививка открыты в новой вкладке (`window.open`, `history.length` = 1): после ввода «Назад» спрашивает, «Уйти» ведёт в раздел за 230–550 мс, вопрос закрыт, копии нет, «Назад» из раздела — на форму без вопроса. Снимки `09/first-entry-ask-{1440,390}.png`, `09/first-entry-left-{1440,390}.png`;
- «Перейти к содержимому» с клавиатуры до и после ввода: адрес без `#`, `history.length` не меняется, фокус на `main`; «Назад» спрашивает один раз, «Уйти» — на страницу перед формой. Снимки `09/skip-link-back-ask-{1440,390}.png`;
- `&from=form` у Мурки с тремя измерениями: поле веса пустое, день — сегодня, подсказки об анкете нет;
- «Все сроки» с `saved=held`: «Визит отмечен состоявшимся.» и «Открыть запись» (`09/due-held-notice-1440.png`); с `saved=completed` — «Отмечено сделанным.».

iOS Simulator (iPhone 17e, iOS 26.5, dev-сборка с локальным стеком): курс, завершённый вчера через API при открытом экране, — «Завершить курс» перечитывает курс и показывает «Курс завершён…» без ошибки (`09/ios-final-fix-course-reread.png`); лист веса открывается и закрывается как раньше. Ответ «ключ уже использован» и полночь в симуляторе не воспроизводятся — покрыты тестами. `apps/mobile/.env.local` на время прогона убирался и возвращён.

```
npm run typecheck                    → exit 0 (mobile, web, contracts, shared)
npm run lint                         → чисто
npm test                             → web: Test Files 63 passed (63), Tests 525 passed (525)
(packages/shared) npx vitest run     → Test Files 12 passed (12), Tests 132 passed (132)
npm test --workspace @lapka/mobile   → Test Files 42 passed (42), Tests 395 passed (395)
npm run test:integration             → Test Files 46 passed (46), Tests 468 passed (468)
(apps/web) npx vitest run --config vitest.integration.config.mts tests/integration/fixtures.test.ts → Tests 5 passed (5)
node apps/web/scripts/seed-medical-record-demo.mjs --api http://localhost:3100 → exit 0
npm run build                        → exit 0
PLAYWRIGHT=… CHROME=… node docs/verification/medical-record-web-09/final-fix-screens.mjs → exit 0
```

Остаётся: в форме — первой записи вкладки защита по-прежнему кладёт копию, так что «Назад» становится доступен там, где был неактивен; теперь он спрашивает и «Уйти» ведёт по ссылке назад формы. После такого ухода в истории «вперёд» копии нет. Safari и Firefox для этих случаев не проверялись.

## Решения контроллера этапа и их цена

| Решение | Цена |
|---|---|
| MW-09 добавляет миграции (гонки, ключи, очистка, позиция, ключ веса требуют SQL). Применяются только локально, владелец делает `db push` staging → production до слияния | Лишний шаг выпуска; плохая миграция задержит слияние |
| Отказ `record_done` в SQL включается параметром (`p_refuse_done default false`), чтобы код `origin/main` работал между `db push` и деплоем | Вызов без флага пропускает SQL-защиту (проверка сервиса остаётся) |
| В раунд 1 Task 1 взяты: SQLSTATE `LPKEY`, точность OpenAPI «Сделано», пустое утверждение в тесте | Небольшая |
| Повтор всех миграций с нуля в одноразовой базе (Task 7) | Небольшая (сделано) |
| `next build` в Task 7 | Небольшая (сделано) |
| Вес с двумя знаками и возраст 0 — одно общее правило в `packages/shared` (Task 3 для обоих приложений) | Нет |
| После сохранения записи — к разделу или источнику с уведомлением (правила передачи важнее прежнего отклонения MW-03) | На один переход больше, чтобы увидеть запись (ссылка «Открыть запись» в уведомлении) |
| После полуночи дата по умолчанию у новой записи остаётся вчерашней; меняются только `min`/`max` | Владелец может сохранить вчерашнюю дату, если не посмотрит на поле |
| В раунд 1 Task 2 взяты: `apiMessages` по `ErrorCode`, тест подмены `x-lapka-page` | Небольшая |
| В раунд 1 Task 3 взяты: возраст 0 везде, «курс завершился по дате», live-область `DriftNotice`, `nextHintText`, фокус после «Остаться», комментарий о смене пояса | Небольшая |
| Дисклеймер печати: строка в потоке под заголовком (всегда), копия в полях страницы; закрывающий подвал не печатается | В Chrome с полями дисклеймер на первой странице дважды |
| Мурка в Safari на iOS — 2 страницы (iOS печатает ×1,2; спецификация допускает 1–2), без масштаба под устройство | Пользователи iOS получают два листа |
| `fileTitle` через общий `fileNameStem`, рез по графемам | Небольшая |
| Пустое начало курса допустимо, если `started_on === null` (старые сборки сохраняли курсы без начала с `source = 'record'`) | Курс без начала можно оставить без начала при правке |
| Длины прививки/обработки на телефоне и мелкие замечания Task 5 — в Task 6 | Нет |
| Замечания ревью Task 6 (`scroll-padding-bottom`, комментарий, пустые строки) — в Task 7 | Нет |
| Safari на Mac, настоящий экранный диктор, `verify.mjs` в CI — вне этапа | Остаются ограничениями |

## Остающиеся ограничения

**Не закрываются кодом (план этапа)**
- **Safari на Mac** не проверялся ни на одном этапе: агент им не управляет. Safari на iOS проверен в Simulator (печать, имя PDF, заголовки). Владельцу проверить печать и «Сохранить PDF» Барона и Мурки, «Назад» в изменённой форме, формы на ширине окна ~1024.
- **Настоящий экранный диктор** (VoiceOver/NVDA) не проверялся. Проверено автоматически: имена, фокус, порядок Tab, `aria-*`, live-области.
- **`verify.mjs` не в CI**: им нужны Playwright и Chrome в раннере — отдельная задача инфраструктуры.

**Найдено или оставлено в Task 7**
- **Поле заметки (многострочное) при 200 % или на узком окне.** Chrome, получив фокус Tab, показывает каретку поля, а не всё поле. Верх поля и каретка остаются над нижней навигацией, но нижняя часть высокого поля может уйти под неё: заметка формы прививки на 720×500 и 640×400, причина визита на 720×500. WCAG 2.4.11 (AA, «не скрыт целиком») это допускает. `scroll-margin` на каретку не действует; исправление — только скриптом при фокусе, его не делали. Скрипт выводит такие случаи отдельно (`focusPartlyCovered`), снимки `09/zoom200-form-*-focus-partly.png`.
- Проверка фокуса при ≤760 px сделана в Chrome. Safari (iOS и Mac) `scroll-padding` при фокусе с клавиатуры не проверялся.

**Отложенные замечания ревью, которые видит владелец**
- «Уточнить» решено правилом «то же значение = то же измерение», пока истории нет. Если владелец меняет значение при датировании, остаются две строки: новая датированная и прежняя недатированная. Датированная строка получает пометку `record` (не «из анкеты»). (Task 1)
- Страницы записи и `health/new` без `loading.tsx`: при переходе без предзагрузки навигация ждёт серверную проверку, скелет экрана появляется после неё. Это цена настоящего 404. (Task 2)
- На телефоне между многоточием названия срока и «—» зазор чуть шире задуманного. (Task 2)
- Защита «Назад»: без Navigation API (браузеры, где его нет) копия после перезагрузки узнаётся по адресу и `history.length` — эвристика. Переход меню истории или `go(±n)` на копию требует двух «Назад». Копия может остаться в истории «вперёд». В Chrome всё проверено, Safari и Firefox — нет. (Task 3)
- Печать: обрезка проверки одной строкой может скрыть часть симптомов (полный текст — на экране, §7.17). В Safari у Барона на стр. 1 около 40 % пусто: таблица прививок целиком уходит на стр. 2. В Safari дисклеймер — только строка на стр. 1 (плюс колонтитул самого Safari с адресом). Chrome с включёнными «Колонтитулами» и Firefox не проверялись. (Task 4)

**Только код и тесты** (на владельца не влияют): копия правила `changesCourse` в SQL и непроверенная ветка «ничего не меняет» в гонке; место `RECORD_DONE_SQLSTATE` и встроенное сопоставление `LP409`; `useRef(newRequestKey())` в `WeightSheet` вызывает генератор при каждой отрисовке; `ApiErrorCode = ErrorCode | (string & {})` ослабляет проверку опечаток; `requestToday`/`clientToday` лежат в `weight-service.ts`; в `MedicalRecordScreen` проверка префикса пути без границы; у `useLeaveGuard` нет тестов DOM (логика — в `leave-guard.ts` с тестами); компонентные тесты без jsdom не исполняют эффекты; английский текст баннера телефона не проверяется тестом; `SummarySkeleton` похож на `FormSkeleton`; `task4-pdf-check.py` узко проверяет заголовок внизу страницы; телефон: `Screen.hold` при каждом фокусе поля делает замер `showTop` (прокручивает, только если поле выше края); `pet_weight_requests` растёт без очистки (по строке на сохранение веса с ключом, удаляется каскадом с питомцем и аккаунтом).
