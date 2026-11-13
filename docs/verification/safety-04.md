# SAFE-04: вкладка «Можно ли?» в приложении

Отчёт о четвёртом этапе функции «Можно ли это питомцу»: поиск по справочнику, карточка вердикта, ответ ИИ и переход в проверку симптомов в мобильном приложении.

## Паспорт

| Поле | Значение |
| --- | --- |
| Этап и название | SAFE-04 — вкладка в приложении |
| Статус | ACCEPTED на iOS-симуляторе; Android не проверен (см. «Непроверенное и риски») |
| Даты работы | 13 ноября 2026, Europe/Moscow |
| Версия плана | [Спека](../superpowers/specs/2026-11-13-pet-safety-design.md) (раздел «Приложение»), бриф Task 4 из `.superpowers/sdd/2026-11-13-pet-safety/` |
| Проверенный код | `303a568` на ветке `claude/can-pet-eat-f35f72` (симулятор прогонялся на рабочем дереве до коммита; отличие — только снятые временные `console.log`) |
| PR / коммиты | PR не создан. `303a568` Mobile: «Можно ли?» tab — search, verdict card, AI answer, hand-off to a symptom check |
| Окружение | Локальное: общий локальный Supabase (`apps/web/.env.integration`), `next dev -p 3100 --webpack` из worktree (Turbopack из worktree не находит `next`, см. «Ошибки»), ключ OpenAI — из `apps/web/.env.staging.local` основной копии; Metro (Expo SDK 57) из worktree с `EXPO_PUBLIC_*` локального стека |
| Сборки | Debug-сборка `my.lapka.app` 1.2.1 (1), уже установленная на симуляторе iPhone 17 Pro, iOS 26.5; JS из Metro. Нативный код этап не меняет. Android — не запускался |

## Что сделано

До этапа в приложении было три вкладки. Теперь между «Проверкой» и «Профилем» — «Можно ли?» / “Safe?”: выбор питомца (без питомцев — «Кошка | Собака»), поле поиска с подсказками из закэшированного индекса, недавние запросы, «Часто спрашивают» по категориям. Карточка позиции всегда читается с сервера; ответ ИИ рисуется той же карточкой с плашкой. «Проверить симптомы» открывает форму проверки с питомцем и началом описания; начатый черновик заменяется только после вопроса.

| Файл или компонент | Что изменено | Зачем | Пункт брифа |
| --- | --- | --- | --- |
| `app/(tabs)/_layout.tsx`, `src/ui/Icon.tsx` | Вкладка `safety` между `check` и `profile`, иконка `bowl` | Четвёртая вкладка | Шаг 4 |
| `app/(tabs)/safety/{_layout,index,[slug],ask}.tsx` | Стек вкладки, главный экран, карточка позиции, ответ ИИ | Экраны раздела «Приложение» | Шаг 4 |
| `src/features/safety/SafetySearch.tsx` | Поле, недавние, подсказки `matchSafety`, «нет в справочнике» + «Спросить ИИ», «Справочник скоро появится», категории, `POPULAR_SLUGS` (первые 12) | Главный экран | Шаг 4 |
| `src/features/safety/SafetyCard.tsx`, `VerdictBadge.tsx`, `SafetySubjectPicker.tsx` | Карточка (вердикт, строка лекарства, пометки, «Почему», «Признаки», «Если уже съел», второй вид, источники, подпись ИИ, дисклеймер), бейдж/блок вердикта, выбор питомца | Карточка | Шаг 4 |
| `src/features/safety/{recent,subject,card-model,to-check}.ts` + тесты | Чистые модули по интерфейсам брифа | TDD | Шаги 1–3 |
| `src/features/safety/use-safety-memory.ts` | Недавние запросы в хранилище, последний питомец, остаток ответов ИИ на сегодня | Состояние вкладки между экранами | Шаг 3 |
| `src/features/checks/check-draft.ts` + тест | `prefillDecision` | Решение о подстановке | Шаг 5 |
| `app/(tabs)/check/index.tsx` | Приём `prefill`/`petId`, диалог «Заменить начатое описание?», сброс параметров | Переход в проверку | Шаг 5 |
| `src/features/checks/use-check-draft.ts` | Флаг `draftRead` (черновик прочитан) | Иначе восстановленный черновик затирал подстановку без вопроса | Шаг 5 |
| `src/features/checks/use-check-pet.ts` | При `prefill` параметр `petId` не применяется здесь | Иначе «Оставить» всё равно переключало питомца черновика | Шаг 5 |
| `src/i18n/{ru,en}.ts`, `src/lib/query-keys.ts` (+ тест) | Срез `safety`, `tabs.safety`; `safetyIndex` (в `PERSISTED`), `safetyItem` | Тексты и кэш | Шаг 3 |

## Решения и отклонения

- **Хранилище недавних.** Бриф называет AsyncStorage, но пакета в приложении нет, а нативный модуль потребовал бы новой сборки. Недавние лежат в том же хранилище, что черновик проверки (`draftStorage`, keychain), под ключом `lapka.safety-recent`, с `userId` внутри: чужой список не читается (`parseRecent`). Выход из аккаунта этот ключ не стирает (он не в `alwaysClear`, `supabase.ts` не трогал), но следующий аккаунт его не увидит.
- **Последний выбранный питомец и остаток ИИ** держатся в памяти на время запуска (`use-safety-memory.ts`), с привязкой к аккаунту.
- **Два файла вне списка брифа:** `use-check-draft.ts` (флаг `draftRead`) и `use-check-pet.ts` (не применять `petId` при `prefill`). Без них подстановка либо терялась под восстановленным черновиком, либо «Оставить» меняло питомца черновика. Изменения — по несколько строк.
- **`otherSpecies.label`.** В модель карточки добавлено поле `label` второго вида (подпись по той же категории). Интерфейс брифа расширен, не изменён.
- **Второй вид.** Строка «Для кошек: Нельзя ›» переключает карточку на другой вид; пометки и кнопка проверки показываются только для вида питомца.
- **Дисклеймер.** Использован существующий `t.result.disclaimer` словаря приложения (в общем `vocab` дисклеймера нет).
- **Ключ индекса без языка.** `['safety-index']`, как в брифе. После смены языка аккаунта индекс на старом языке виден до следующего обновления (30 с на фокусе).

## Матрица приёмки

| ID | Критерий | Способ проверки | Ожидаемый результат | Фактический результат | Статус | Свидетельство |
| --- | --- | --- | --- | --- | --- | --- |
| SAFE-04.1 | Четыре вкладки; «Можно ли?» с полем поиска, выбором питомца и частыми позициями | Симулятор, en и ru аккаунты | Вкладка открывается с полем, питомцем, списком | Так; ru: «Можно ли?», выбор Мурка/Рекс | PASS | [01](safety-04/01-tab-home-en.png), [24](safety-04/24-ru-tab-home.png), [25](safety-04/25-ru-pet-picker.png), [26](safety-04/26-ru-card-ibuprofen-rex-medicine-line.png) |
| SAFE-04.2 | Без питомцев — «Кошка \| Собака», кнопка предлагает добавить питомца; пустой справочник не даёт пустого экрана | Питомец owner-b временно помечен удалённым; индекс временно пуст (правка `load.ts`, откачена) | Переключатель, «Добавьте питомца…» → `CheckNeedPet`; «Справочник скоро появится» | Так; «Собака» меняет вердикт лилии | PASS | [20](safety-04/20-no-pets-species-switch-dog.png), [21](safety-04/21-no-pets-card-for-dogs.png), [22](safety-04/22-no-pets-add-pet-button.png), [23](safety-04/23-no-pets-check-need-pet.png), [19](safety-04/19-empty-index-coming-soon.png) |
| SAFE-04.3 | Подсказки без обращения к сети | Ввод «chocolote», «milk»; лог `next dev` | Ни одного запроса во время ввода | Во время ввода запросов нет, индекс запрошен один раз при открытии вкладки | PASS | [02](safety-04/02-typo-chocolote.png) |
| SAFE-04.4 | Вердикт для вида питомца, аллергия/хронические, «Если уже съел» по `if_eaten`, второй вид, источники, дисклеймер | Шоколад и молоко для Барсика (аллергия «milk» временно в анкете), ибупрофен для Рекса | Всё на карточке | Так: `call_now` — красная строка и вторичная кнопка; `watch` — «Наблюдайте…» и основная кнопка | PASS | [03](safety-04/03-card-chocolate-cat-top.png)–[06](safety-04/06-card-chocolate-other-species-dog.png), [08](safety-04/08-card-milk-allergy-note.png), [26](safety-04/26-ru-card-ibuprofen-rex-medicine-line.png) |
| SAFE-04.5 | Карточка ИИ с плашкой и остатком; исчерпанный лимит объяснён | «dragon fruit» → «Ask AI» (реальный вызов) | Плашка, «Нет данных», «осталось N из 10» | Плашка нейтрального цвета, NO DATA, «8 of 10 left today» под карточкой и на главном экране. Текст `rate_limited` — только по коду (лимит не исчерпывался) | PASS (лимит — по коду и словарю) | [07](safety-04/07-miss-ask-ai-limit-line.png), [13](safety-04/13-ai-card-top.png), [14](safety-04/14-ai-card-bottom-remaining.png), [15](safety-04/15-home-remaining-after-answer.png), [12](safety-04/12-ask-failed-retry.png) |
| SAFE-04.6 | Проверка открывается с питомцем и началом описания; черновик не теряется без вопроса | Молоко → «Check symptoms»; дописать текст; шоколад → «Check symptoms» → диалог; «Keep»; «Replace» | Подстановка; диалог; «Оставить» сохраняет | «Ate: milk. » и Barsik; диалог; «Keep» оставил черновик (лог `keep`); «Replace» заменил на «Ate: chocolate. » | PASS | [09](safety-04/09-handoff-check-form-applied.png), [10](safety-04/10-handoff-replace-dialog.png), [11](safety-04/11-handoff-keep-draft-kept.png) |
| SAFE-04.7 | Вердикт всегда с сервера; исчезнувшая позиция не роняет экран | Индекс временно отдаёт «шоколад: safe» для кошки (откачено); ссылка `lapka://safety/no-such-entry` | Список «Safe to eat», карточка «NOT SAFE»; «Этой записи больше нет» | Так | PASS | [16](safety-04/16-tampered-index-chocolate-safe.png), [17](safety-04/17-card-shows-server-verdict.png), [18](safety-04/18-entry-gone.png) |
| SAFE-04.8 | Экран результата и медкарта не затронуты | `git show --stat 303a568` | Нет `CheckResult.tsx`, `check/[id].tsx`, `medical-record/**` | Нет | PASS | `git show --stat 303a568` |
| SAFE-04.9 | Все тексты в `ru.ts` и `en.ts` | `i18n.test.ts` (ключи совпадают, пустых нет, не одинаковые) | Зелёный | Зелёный | PASS | `npm run test` |

## Hermes и `\p{L}`

Временный `console.log` на главном экране (снят до коммита) в ru-аккаунте:

```
DEBUG hermes object "шокалад еж" shokolad vinograd
```

`HermesInternal` — `object` (движок Hermes); `normalizeSafetyQuery('Шокалад, Ёж!')` → `шокалад еж` (кириллица сохранена, «ё»→«е», пунктуация убрана); `matchSafety(index, 'шокалад').exact` → `shokolad` (опечатка), `matchSafety(index, 'ВИНОГРАД').exact` → `vinograd`. В en-аккаунте опечатка «chocolote» нашла Chocolate ([02](safety-04/02-typo-chocolote.png)). Регэксп `\p{L}` с флагом `u` на Hermes работает.

## Автоматические проверки

| Набор | Команда (корень worktree) | Ревизия | Exit | Результат |
| --- | --- | --- | --- | --- |
| Типы | `npm run typecheck` | рабочее дерево = `303a568` | 0 | — |
| Линт | `npm run lint` | то же | 0 | 0 ошибок; в mobile 3 новых предупреждения react-compiler в `check/index.tsx` (setState в эффекте, как в `CheckHistory.tsx`) |
| Тесты | `npm run test` | то же | 0 | web 603, shared 839, mobile 257 — все прошли |
| TDD RED | `npx vitest run src/features/safety src/features/checks/check-draft.test.ts` (apps/mobile) до реализации | — | 1 | 5 файлов упали: модулей нет, `prefillDecision is not a function` |
| TDD GREEN | та же команда после | — | 0 | 35 passed |

Компоненты экранов тестами не покрыты (в приложении тестируется только чистая логика); их поведение проверено в симуляторе.

## Ручные проверки

Симулятор iPhone 17 Pro, iOS 26.5, Debug 1.2.1 (1), Metro из worktree, API `127.0.0.1:3100`, локальный Supabase. Вход — magic link (`/auth/v1/admin/generate_link` + `lapka://auth/callback`), пароли не вводились. Аккаунты фикстур: owner-b (en, кот Barsik), owner-a (ru, Мурка и Рекс).

1. owner-b: вкладка «Safe?» ([01](safety-04/01-tab-home-en.png)); «chocolote» → Chocolate ([02](safety-04/02-typo-chocolote.png)); карточка шоколада для Barsik ([03](safety-04/03-card-chocolate-cat-top.png)–[05](safety-04/05-card-chocolate-if-eaten.png)); «For dogs ›» → карточка для собак без кнопки проверки ([06](safety-04/06-card-chocolate-other-species-dog.png)).
2. «milkmilk» → «нет в справочнике», «up to 10 AI answers a day» ([07](safety-04/07-miss-ask-ai-limit-line.png)). Молоко с аллергией «milk» в анкете Barsik ([08](safety-04/08-card-milk-allergy-note.png)).
3. Переход в проверку: подстановка ([09](safety-04/09-handoff-check-form-applied.png)), диалог ([10](safety-04/10-handoff-replace-dialog.png)), «Keep» ([11](safety-04/11-handoff-keep-draft-kept.png)). Проверка не отправлялась.
4. «dragon fruit» → «Ask AI»: первый вызов — 500 (сервер без ключа, см. «Ошибки»), экран «Could not answer» с повтором ([12](safety-04/12-ask-failed-retry.png)); после перезапуска API — «Try again», ответ ИИ ([13](safety-04/13-ai-card-top.png), [14](safety-04/14-ai-card-bottom-remaining.png)), остаток на главном экране ([15](safety-04/15-home-remaining-after-answer.png)).
5. Review Focus 5 и исчезнувшая позиция ([16](safety-04/16-tampered-index-chocolate-safe.png)–[18](safety-04/18-entry-gone.png)); пустой индекс ([19](safety-04/19-empty-index-coming-soon.png)).
6. Без питомцев ([20](safety-04/20-no-pets-species-switch-dog.png)–[23](safety-04/23-no-pets-check-need-pet.png)).
7. owner-a (ru): вкладка, выбор питомца, ибупрофен для Рекса со строкой о лекарствах и «для Рекса (собака)» ([24](safety-04/24-ru-tab-home.png)–[26](safety-04/26-ru-card-ibuprofen-rex-medicine-line.png)). Недавние у owner-a пусты — список привязан к аккаунту.

Реальные вызовы `POST /safety/ask`: два. Первый дошёл до OpenAI без ключа (401 от OpenAI, 500 клиенту, попытка лимита потрачена, модель не отвечала). Второй — настоящий ответ модели (`dragon fruit`, cat, en), записан в локальный кэш `safety_ai_answers`.

Временные изменения данных и кода, все откачены: аллергия `["milk"]` и `deleted_at` у Barsik (owner-b) — возвращены `[]` и `null`; `apps/web/src/features/safety/load.ts` (подмена вердикта, пустой индекс) — `git checkout`; `apps/mobile/.env.local` в worktree — удалён; `apps/web/AGENTS.md`, который пишет `next dev`, — `git checkout`.

## Ошибки и повторные проверки

| Дефект / сбой | Запись | Причина / исправление | Повтор | Ограничения |
| --- | --- | --- | --- | --- |
| Строка «for Barsik (cat)» обрезана сверху | Первый скриншот карточки | `marginTop: -8` у строки под заголовком; убран | [03](safety-04/03-card-chocolate-cat-top.png) | — |
| `next dev` (Turbopack) в worktree: «Could not find the Next.js package» | Лог web | `node_modules` лежит выше корня worktree; запуск с `--webpack` | API отвечает 200 | Окружение, не код |
| Первый «Ask AI» → 500 «You didn't provide an API key» | [12](safety-04/12-ask-failed-retry.png) | В worktree нет `apps/web/.env.staging.local`; ключ взят из основной копии, API перезапущен | Ответ получен ([13](safety-04/13-ai-card-top.png)) | Попытка лимита потрачена |
| «Replace» сработал при попытке нажать «Keep» | — | Не дефект: симулятор отставал со скриншотами, второе нажатие «Check symptoms» попало в кнопку «Replace» появившегося диалога. С логами в обработчиках повторено: «Keep» → `keep`, черновик остался | [11](safety-04/11-handoff-keep-draft-kept.png) | — |

## Непроверенное и риски

- **Android** не проверен: планшет не подключён (`adb devices` пуст). Четыре подписи на узком экране — открытый риск спеки.
- **`rate_limited`** не воспроизводился (лимит не исчерпывался); текст и ветка — по коду.
- **Контент (SAFE-06):** название источника MSD у шоколада на en-аккаунте — по-русски ([04](safety-04/04-card-chocolate-cat-bottom.png)); summary начинается со слова вердикта, которое уже стоит заголовком («NOT SAFE / Not safe. …»).
- **Ответ ИИ (SAFE-07):** модель пишет «not well supported by the provided knowledge base» — внутреннюю кухню видно пользователю ([13](safety-04/13-ai-card-top.png)); `summary` советует «Use caution» при вердикте «Нет данных».
- **Недавние после выхода** остаются в keychain (не в `alwaysClear`), хотя чужому аккаунту не показываются.
- **Предупреждения линтера** в `check/index.tsx` (setState в эффекте) — 3 новых, ошибок нет.

## Итог и следующий шаг

9 из 9 критериев PASS на iOS-симуляторе; Android — NOT RUN (не критерий этапа, шаг 7 брифа). Следующий этап — SAFE-05 / SAFE-06; Android-проверку четырёх вкладок — при подключённом планшете.

## История проверок

- 13.11.2026 — TDD RED/GREEN, полный `typecheck`/`lint`/`test`, прогон в симуляторе (этот отчёт). Скриншоты — `docs/verification/safety-04/` (не в git).
