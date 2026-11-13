# SAFE-05: публичные страницы «Можно ли»

Отчёт о пятом этапе функции «Можно ли это питомцу»: хаб `/mozhno-li` с поиском в браузере и страница на каждую позицию справочника `/mozhno-li/<slug>`, статические, без входа.

## Паспорт

| Поле | Значение |
| --- | --- |
| Этап и название | SAFE-05 — публичные страницы |
| Статус | ACCEPTED (локальная production-сборка; Vercel preview не открывался) |
| Даты работы | 13 ноября 2026, Europe/Moscow |
| Версия плана | [Спека](../superpowers/specs/2026-11-13-pet-safety-design.md) (разделы «Сайт», «Что значит вердикт», «Откуда данные и как они проверяются»), бриф Task 5 из `.superpowers/sdd/2026-11-13-pet-safety/` |
| Проверенный код | `e30fbe5` на ветке `claude/can-pet-eat-f35f72` |
| PR / коммиты | PR не создан. `e30fbe5` Web: public «можно ли» pages built from the safety reference |
| Окружение | Локальное: Node 25.2.1, Next.js 16.4.3, `next build --webpack` из worktree (Turbopack-сборка в worktree без своих `node_modules` не работает), `next start -p 3411` с `apps/web/.env.staging` (без переменных Supabase страница 404 у группы приложения падает в 500 — так же и у `/otravlenie/nope`, это не новое) |
| Сборки | Две production-сборки: без `VERCEL_ENV` (как production) и с `VERCEL_ENV=preview` (черновики видны). Мобильных сборок этап не касается |

## Что сделано

До этапа справочник был только в API и в приложении. Теперь на сайте есть хаб и страницы позиций в группе `app/(content)`, рядом с `/otravlenie`: без сессии, пререндер, статическая CSP контентных страниц. На сайте только справочник, без ИИ и анкеты питомца; всё, чего нет, ведёт в приложение.

| Файл или компонент | Что изменено | Зачем | Пункт брифа |
| --- | --- | --- | --- |
| `app/(content)/mozhno-li/page.tsx` | Хаб: поиск (клиентский компонент), позиции по категориям ссылками с вердиктами для кошек и собак, пустое состояние «Справочник скоро появится», призыв в приложение; `noindex`, пока ничего не опубликовано | Хаб | Шаг 3 |
| `app/(content)/mozhno-li/[slug]/{page,opengraph-image,twitter-image}.tsx` | Страница позиции, `generateStaticParams` = `visibleEntries()`, `dynamicParams = false`, метаданные через `publicPageMetadata`, OG-картинка через `renderOgCard` | Страница позиции | Шаг 3 |
| `features/safety/SafetyArticle.tsx` | Тело страницы: H1, плашки вердикта по видам, строка лекарства, подпись/черновик со ссылкой на `/o-materialah`, «Почему», «Признаки», «Если питомец уже съел» (`firstSteps`, `avoid`), «Подробнее об отравлении», блок призыва, источники, JSON-LD `FAQPage` + `BreadcrumbList`; `safetyHeading`, `safetyDescription`, `safetyFaqJsonLd`, `safetyCrumbs` | Страница позиции | Шаг 3 |
| `features/safety/SafetyHubSearch.tsx` (`'use client'`), `hub-search.ts` | Поле поиска появляется только после гидрации (`useSyncExternalStore`); `matchSafety` по индексу из пропса; Enter открывает найденную позицию; «Этого пока нет в справочнике. Спросить можно в приложении» со ссылкой на регистрацию | Поиск на хабе | Шаг 3 |
| `features/safety/verdict.ts` | Подпись вердикта по категории (`verdictLabelKey` + общий словарь) и цвет — классы срочности, как в `VerdictBadge.tsx` приложения | Те же подписи, что в приложении | Шаг 3 |
| `packages/shared/src/i18n/vocab.ts`, `apps/mobile/src/i18n/{ru,en}.ts` | Подписи вердиктов, категорий и строка лекарства перенесены в общий словарь; приложение берёт их оттуда, значения не изменились | Одни подписи на сайте и в приложении | Шаг 3 |
| `features/safety/schema.ts`, `content/safety/*.json`, `content/README.md` | Необязательное `titleRu` (винительный падеж); заполнено у всех 12 пилотных позиций | H1 «Можно ли кошкам и собакам …?» | Шаг 3 |
| `features/safety/load.ts`, `shared/content-paths.ts` | `safetyPath` (в `content-paths.ts`, чтобы им пользовался и браузер; `load.ts` его реэкспортирует), `entryForToxin`; `mozhno-li` в `CONTENT_SEGMENTS` | Пути и CSP | Шаг 3 |
| `proxy.ts` | `mozhno-li` в регулярном выражении matcher'а | Прокси не трогает страницы | Шаг 3 |
| `app/sitemap.ts` | Опубликованные позиции и хаб — только когда есть хоть одна опубликованная позиция | Sitemap | Шаг 3 |
| `app/(content)/otravlenie/[slug]/page.tsx` | «Коротко для кошек и собак: <ссылка на позицию>» | Ссылки в обе стороны | Шаг 3 |
| `app/(content)/{otravlenie,simptomy}/page.tsx` | Ссылка на `/mozhno-li`, пока в справочнике есть что показать | Хабы | Шаг 3 |
| `app/(content)/o-materialah/page.tsx` | Раздел «Справочник «Можно ли»»: что это, подписи вердиктов, источники, два круга проверки агентами, публикация редакцией; ветеринар не подписывает | Описание справочника | Шаг 3 |
| `features/seo-content/components/CheckCta.tsx` | Необязательные `title` и `children`; кнопки те же | Блок призыва со своим заголовком | Шаг 3 |
| `app/styles/articles.css` | Блок `.safety-*`, `.verdict-pair` | Вёрстка | Шаг 3 |
| `tests/unit/safety/pages.test.ts`, `tests/unit/seo-content/sitemap.test.ts`, `packages/shared/src/i18n/vocab.test.ts` | Тесты шага 1 и подписи вердиктов | TDD | Шаг 1 |

## Решения и отклонения

- **Хаб в sitemap — только с первой опубликованной позицией.** Бриф говорит «sitemap содержит `/mozhno-li`», но сегодня все позиции — черновики, и в production хаб — пустая страница. Пустую страницу индексировать незачем: хаб попадает в sitemap вместе с первой опубликованной позицией, а пока ничего не опубликовано, у хаба `noindex, follow`. Тест проверяет оба случая (второй — временной публикацией позиции в кэше загрузчика). Ссылки на `/mozhno-li` с хабов `/otravlenie` и `/simptomy` по той же причине появляются, только когда в справочнике есть что показать.
- **Подписи вердиктов в общем словаре.** Чтобы сайт и приложение не разошлись, `verdict`, `categories` и `medicineLine` из среза `safety` приложения перенесены в `vocab` (`safetyVerdict`, `safetyCategories`, `safetyMedicineLine`); словари приложения ссылаются на них. Значения не изменились; это правка за пределами списка файлов брифа (по строке в `apps/mobile/src/i18n/{ru,en}.ts`).
- **Дополнительные файлы** `verdict.ts` и `hub-search.ts`: подпись вердикта нужна и хабу, и странице; логика поиска хаба — чистая функция, проверяемая без DOM.
- **`safetyPath` живёт в `shared/content-paths.ts`** и реэкспортируется из `load.ts` (как в брифе): `load.ts` — `server-only`, а поиск хаба строит ссылки в браузере.
- **Enter в поиске** открывает позицию полной загрузкой (`window.location.assign`), без роутера: страница статическая, а компонент не зависит от контекста App Router.
- **Описание страницы** — `summary` вида, для которого вердикт строже; при равенстве — собаки.
- **Строка о подготовке материалов** на странице позиции: «Подготовлено с помощью ИИ по ветеринарным источникам. Ветеринарный врач текст не подписывал.» + «Как мы готовим материалы». Проверка ветеринаром нигде не упоминается (есть тест).
- `titleRu` заполнен у всех 12 позиций: вопросная форма заголовка совпадает с поисковым запросом. У «Лилии» — «лилии», у «Яблока» — «яблоки» (так спрашивают).
- Запуск через launch-запись `web-staging-prod` не использовался: в worktree нет `.env.staging.local`. Сервер поднимался вручную тем же `next start` с `.env.staging`.

## Матрица приёмки

| ID | Критерий из плана | Способ проверки | Ожидаемый результат | Фактический результат | PASS / FAIL / NOT RUN | Ссылка на запись проверки |
| --- | --- | --- | --- | --- | --- | --- |
| SAFE-05.1 | `/mozhno-li` и `/mozhno-li/<slug>` открываются без входа, статически, с CSP контентных страниц; прокси их не трогает | `curl -D -` без cookie к production- и preview-сборке; вывод `next build`; тесты matcher'а | 200, `x-nextjs-cache: HIT`, `Cache-Control: s-maxage=31536000`, CSP со `script-src 'self' 'unsafe-inline'` (статическая); `○ /mozhno-li`, `● /mozhno-li/[slug]`; matcher не совпадает с `/mozhno-li`, `/mozhno-li/shokolad`, совпадает с `/mozhno-li-drugoe` | Как ожидалось на обеих сборках; `content-paths.test.ts` автоматически проверил новый сегмент (CSP-правила `next.config.ts`) | PASS | «Ручные проверки» 1, 2; `pages.test.ts` › the content segment |
| SAFE-05.2 | Поиск на хабе находит позицию по названию, alias и опечатке; без JavaScript хаб — список ссылок | Браузер (preview-сборка): «шокалад», «кирпич», «какао» + Enter; HTML хаба без JS; тесты `hubSearch` | Опечатка находит «Шоколад»; «кирпич» — «Этого пока нет в справочнике…» со ссылкой на регистрацию; alias + Enter открывает `/mozhno-li/shokolad`; в HTML нет `<input>`, 12 ссылок на позиции | Как ожидалось | PASS | «Ручные проверки» 3; `pages.test.ts` › the hub |
| SAFE-05.3 | У страницы позиции есть H1, разделы обоих видов, «если уже съел», источники, JSON-LD `FAQPage`, canonical и OG-картинка | HTML `/mozhno-li/shokolad` из preview-сборки; тесты | `<h1>Можно ли кошкам и собакам шоколад?</h1>`, canonical `https://lapka.my/mozhno-li/shokolad`, `"@type":"FAQPage"`, `og:image` отдаёт `image/png` | Как ожидалось | PASS | «Ручные проверки» 2; `pages.test.ts` › the entry pages on a preview |
| SAFE-05.4 | В sitemap только опубликованные позиции; черновик в preview помечен и `noindex`, в production отдаёт 404 | `/sitemap.xml` обеих сборок; HTML черновика в preview; `/mozhno-li/shokolad` в production; тесты | 0 адресов `mozhno-li` в sitemap (публикаций нет); в preview «Черновик: …» и `noindex, nofollow`; в production 404 | Как ожидалось; тест публикации в кэше показывает хаб и позицию в sitemap | PASS | «Ручные проверки» 1, 2; `sitemap.test.ts`; `pages.test.ts` › in production |
| SAFE-05.5 | Страницы `/otravlenie/<slug>` и позиции ссылаются друг на друга; `/o-materialah` описывает справочник и не упоминает проверку ветеринаром | HTML `/otravlenie/shokolad` и `/mozhno-li/shokolad` (preview); `/o-materialah`; тесты | «Коротко для кошек и собак: Можно ли кошкам и собакам шоколад?» → `/mozhno-li/shokolad`; на позиции «Подробнее об отравлении» → `/otravlenie/shokolad`; раздел «Справочник «Можно ли»» | Как ожидалось; в тексте «ветеринарный врач не подписывает», о проверке ветеринаром — ни слова | PASS | «Ручные проверки» 2; `pages.test.ts` › and the poisoning pages link to each other |

## Автоматические проверки

| Набор / назначение | Точная команда и рабочий каталог | Ревизия | Exit code | Passed / failed / skipped | Лог или запись запуска |
| --- | --- | --- | --- | --- | --- |
| RED: новые тесты до кода | `npx vitest run tests/unit/safety/pages.test.ts tests/unit/seo-content/sitemap.test.ts` в `apps/web` | рабочее дерево до кода | 1 | pages.test.ts не загрузился (`Cannot find package '@/features/safety/SafetyArticle'`); sitemap: 1 failed (`expected […] to include 'https://lapka.my/mozhno-li'`), 2 passed | вывод в сессии |
| GREEN: те же тесты | та же команда | рабочее дерево с кодом | 0 | 18 passed | вывод в сессии |
| Типы, все пакеты | `npm run typecheck` в корне | `e30fbe5` | 0 | mobile, web, contracts, shared — без ошибок | вывод в сессии |
| Линт web | `npm run lint` в `apps/web` | `e30fbe5` | 0 | 0 ошибок, 4 старых предупреждения в `contracts.test.ts` | вывод в сессии |
| Тесты, все пакеты | `npm run test` в корне | `e30fbe5` | 0 | mobile 608, web 871, shared 258, всё passed | вывод в сессии |
| Production-сборка | `npx next build --webpack` в `apps/web` | `e30fbe5` | 0 | `○ /mozhno-li`, `● /mozhno-li/[slug]` без страниц (пустой `generateStaticParams` собирается) | вывод в сессии |
| Preview-сборка | `VERCEL_ENV=preview npx next build --webpack` в `apps/web` | рабочее дерево = `e30fbe5` без последней правки CSS | 0 | 12 страниц позиций и 24 картинки | вывод в сессии |

Тесты читают настоящие файлы справочника; среда preview — через `vi.stubEnv('VERCEL_ENV', 'preview')`. Страницы рендерятся `renderToStaticMarkup` без DOM, поэтому клики в поиске проверены не тестом, а в браузере (ниже).

## Ручные проверки

1. **Production-сборка, как сейчас на сайте.** `next build --webpack`, `next start -p 3411` с `.env.staging`. `/mozhno-li`: 200, статическая CSP, `x-nextjs-cache: HIT`, `<meta name="robots" content="noindex, follow">`, «Справочник скоро появится», ни одного `<input>`. `/mozhno-li/shokolad`: 404. `/sitemap.xml`: 0 адресов `mozhno-li`. `/otravlenie/shokolad`, `/otravlenie`: ссылок на справочник нет. PASS.
2. **Preview-сборка.** `VERCEL_ENV=preview` при сборке и запуске. `/mozhno-li/shokolad`: 200 без cookie, статическая CSP, `<title>Можно ли кошкам и собакам шоколад? — Лапка`, H1, canonical, `noindex, nofollow`, «Черновик: страница ещё не опубликована и не проверена.», `FAQPage`, «Если питомец уже съел», «Что сделать сразу», «Чего не делать», «Источники», ссылки на `/otravlenie/shokolad` и `/o-materialah`, блок «Проверьте для своего питомца в приложении»; `og:image` — 200 `image/png`. `/otravlenie/shokolad` ссылается на `/mozhno-li/shokolad`; `/otravlenie` и `/simptomy` — на `/mozhno-li`; `/o-materialah` — раздел о справочнике. Sitemap — 0 адресов `mozhno-li` (черновики туда не попадают и на preview). PASS.
3. **Поиск в панели браузера (preview-сборка, гидрирует).** Поле появилось после загрузки скрипта. «шокалад» → строка «Шоколад» с плашками «Кошкам: Нельзя», «Собакам: Нельзя». «кирпич» → «Этого пока нет в справочнике. Спросить можно в приложении: зарегистрироваться». «какао» + Enter → `/mozhno-li/shokolad`. PASS.
4. **Ширина 375 px.** `/mozhno-li/liliya` и `/mozhno-li`: `scrollWidth` = 375, без горизонтальной прокрутки; плашки «Кошкам: Опасно» (красная) и «Собакам: С осторожностью» (жёлтая), карточки в одну колонку. Найден лишний отступ над заголовками в карточках «Признаки» — исправлен до коммита (см. ниже). PASS.

## Ошибки и повторные проверки

| Дефект / исходный сбой | Воспроизведение и первая запись | Причина / исправление | Повторная запись и результат | Остаточные ограничения |
| --- | --- | --- | --- | --- |
| Компонент поиска падал в тесте: `invariant expected app router to be mounted` | GREEN-прогон, тест «draws no search field without JavaScript» | `useRouter` вне App Router; заменён на `window.location.assign` | 18 passed; Enter в браузере открывает позицию | — |
| `/mozhno-li/shokolad` в production отдавал 500, а не 404 | Первый `next start` без переменных окружения | 404-страница приложения создаёт клиент Supabase; так же `/otravlenie/nope`. Запуск с `.env.staging` | 404 у обоих | На Vercel переменные есть |
| Лишний отступ над «Кошки»/«Собаки» в карточках «Признаки» | Скриншот 375 px | Правило `h3` ограничено `.article-section > h3` | Финальная `next build --webpack` — exit 0; визуально после правки не пересматривалось | Мелочь вёрстки |

## Непроверенное и риски

- Vercel preview этой ветки не открывался (preview закрыт стеной Vercel); проверено на локальных production-сборках.
- Поведение после публикации (хаб и позиции в sitemap, ссылки с хабов) проверено тестом с временной публикацией в кэше загрузчика, а не сборкой с опубликованной позицией.
- Скриншоты не сохранялись в `docs/verification/safety-05/`.

## Итог и следующий шаг

5 из 5 критериев PASS. Статус ACCEPTED.

**Что production показывает сегодня:** ничего из справочника. Все 12 позиций — `draft`, поэтому `/mozhno-li` — страница «Справочник скоро появится» с `noindex`, `/mozhno-li/<slug>` — 404, в sitemap адресов справочника нет, `/otravlenie` и `/simptomy` на справочник не ссылаются. Всё появится само, когда владелец переведёт позиции в `published`.

Следующий этап — SAFE-06 (контент до 120 позиций, два круга проверки).

## История проверок

- 13 ноября 2026 — RED/GREEN, полный прогон, две production-сборки, curl-проверки и браузер — записи выше, `e30fbe5`.
