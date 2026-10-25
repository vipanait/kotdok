# SEO-01…SEO-04, SEO-06: статьи о симптомах и отравлениях, первая волна

Статус: реализован, ждёт приёмки владельца.
Зависимости: план `docs/plans/seo-symptom-pages/README.md`; проверка индексации от 25 октября 2026 (раздел плана «Проверка индексации»).
Ветка `claude/seo-symptom-pages`, 25 октября 2026. Окружение: production-сборка `next build` + `next start` локально (порт 3200) с публичными переменными `.env.staging`; браузер — встроенный Chromium, 1440 px и пресет 375×812. Vercel-превью не разворачивалось: PR не открыт.

Решение владельца от 25 октября 2026 (позже в тот же день): блок «Это срочно?» удалён со страниц целиком — код, поле `quiz`, правила; кнопка «Проверить в Лапке» стоит сразу после уровней срочности. Строки SEO-03.3, SEO-03.4 и SEO-06.3 ниже относятся к состоянию до удаления. Решение владельца от 25 октября 2026: ветеринар тексты не вычитывает; черновик пишет модель, проверяет второй агент, публикует владелец слиянием. Критерии ниже читаются с этой поправкой (см. план).

## SEO-01. Статическая основа

| Критерий | Результат | Доказательство |
|---|---|---|
| SEO-01.1 статика для контента, приложение как было | PASS | `next build`: `○ /simptomy`, `○ /simptomy/koshki`, `○ /simptomy/sobaki`, `○ /otravlenie`, `○ /o-materialah`, `● /simptomy/[slug]`, `● /otravlenie/[slug]` (SSG, 47 + 6 путей, 217 страниц всего); `ƒ /`, `ƒ /register`, `ƒ /legal`, `ƒ /dashboard` и все API — без изменений против сборки до работы |
| SEO-01.2 из кэша, без cookie, CSP без nonce | PASS | `curl -D -`: `/simptomy`, `/simptomy/koshki`, `/simptomy/rvota-u-koshki`, `/otravlenie/liliya`, `/o-materialah` → 200, `x-nextjs-cache: HIT`, `Cache-Control: s-maxage=31536000`, ни одного `set-cookie`, CSP `script-src 'self' 'unsafe-inline'` без `nonce-`; TTFB 5–8 мс локально (прокси не проверялся: ветка не задеплоена) |
| SEO-01.3 приложение по-прежнему под nonce-CSP и cookie | PASS | `/`, `/register`, `/legal`, `/simptomyabc` → `nonce-…` в CSP, `set-cookie: NEXT_LOCALE`, `lapka_csrf`; `vitest run` — 80 файлов, 663 теста зелёные, в том числе `tests/server/security/*` и `proxy-page-path` |
| SEO-01.4 нет нарушений CSP, гидратация работает | PASS с оговоркой | Консоль статьи без ошибок CSP; тест «Это срочно?» кликается и считает результат. Выбор `'unsafe-inline'` для путей контента описан в `csp.ts` и плане; **подтверждение владельца ещё не получено** |
| SEO-01.5 404 внутри раздела с noindex | PASS | `/simptomy/net-takoy` → 404, `<meta name="robots" content="noindex">`, CSP статическая, без cookie; `/simptomy/a/b` → 404; `/simptomyabc` → 404 под прокси (matcher привязан к границе сегмента, тест `content-paths.test.ts`). Страница 404 одна на сайт (`global-not-found` → `(frontend)/not-found`), теперь с кнопкой «Симптомы» |
| SEO-01.6 sitemap, robots, OG, иконки как раньше | PASS | `robots.txt` без изменений; `/opengraph-image` 200 image/png; главная и `/legal` снова отдают `og:image`/`twitter:image` (`publicPageMetadata`, тест `tests/unit/shared/site-metadata.test.ts`) |

## SEO-02. Модель контента и статус вычитки

| Критерий | Результат | Доказательство |
|---|---|---|
| SEO-02.1 схема всех блоков, `review`, `locale: ru` | PASS | `src/features/seo-content/schema.ts`; загрузчик падает на невалидном файле с именем файла в ошибке |
| SEO-02.2 production только `published`, превью — черновики с noindex | PASS | `load.ts` `isVisible`; `generateMetadata` ставит `robots: noindex` для черновика; плашка «Черновик» в `Byline`. Проверено в `next dev` на черновике до публикации; на Vercel-превью не проверялось |
| SEO-02.3 тест на `reviewedBy`/`reviewedAt`/`nextReviewAt`, 5–7 вопросов | PASS | `tests/unit/seo-content/content.test.ts` «say when and by whom they were reviewed», схема `quiz.min(5).max(7)` |
| SEO-02.4 запрещённые слова, slug-хабы, robots-префиксы, дубли кошка/собака | PASS | тот же файл: 8 тестов зелёные на 53 страницах; порог сходства < 50 % после исключения служебных полей из `textsOf` |
| SEO-02.5 отчёт о просроченных `nextReviewAt` | NOT RUN | Скрипт `content:review-due` не написан (все даты — 2027-10-25) |

## SEO-03. Шаблон страницы симптома и «Это срочно?»

| Критерий | Результат | Доказательство |
|---|---|---|
| SEO-03.1 SSG через `generateStaticParams`, `dynamicParams = false` | PASS | таблица сборки; неизвестный slug → 404 |
| SEO-03.2 блоки страницы, уровни из словаря, `DISCLAIMER` дословно | PASS | h2 на странице: «Насколько это срочно», «Проверьте симптомы … в Лапке», «Возможные причины по возрасту», «Что сделать дома до визита», «Чего не делать», «Что сказать врачу», «Проверьте симптомы … в Лапке», «Частые вопросы», «Похожие симптомы», «Источники»; названия уровней — `ru.urgency` через `urgencyTitle`; дисклеймер — `ru.check.disclaimerFallback` |
| SEO-03.3 юнит-тесты правил теста | СНЯТ (блок удалён) | до удаления: `tests/unit/seo-content/quiz.test.ts`: 4 теста, перебор всех 2⁵ комбинаций — ниже НАБЛЮДАЕМ недостижимо |
| SEO-03.4 ни одного запроса при ответах, клавиатура, `aria-live` | СНЯТ (блок удалён) | до удаления: `performance.getEntriesByType('resource')` до/после 7 кликов: +0 запросов; `aria-pressed` на Да/Нет, `aria-live="polite"` на результате, результат получает фокус (`document.activeElement` = `.quiz-result`), фокус-кольцо видно по Tab (ревью дизайна) |
| SEO-03.5 JSON-LD валиден | PASS с оговоркой | `@graph`: Organization, MedicalWebPage (`lastReviewed`), BreadcrumbList, FAQPage (4 вопроса); JSON парсится, `<` экранирован. **validator.schema.org не запускался** (нет внешнего адреса) |
| SEO-03.6 уникальные title/description/canonical, OG своя | PASS | `<title>Рвота у кошки: когда срочно к врачу — Лапка</title>`, canonical `https://lapka.my/simptomy/rvota-u-koshki`, `og:image` → `/simptomy/rvota-u-koshki/opengraph-image-…`; схема: `metaTitle ≤ 60`, `metaDescription ≤ 160` |
| SEO-03.7 CTA на `/register?next=/pets/new`, при ЭКСТРЕННО сначала клиника | PASS | `CheckCta`, `SIGN_UP_HREF`; результат ЭКСТРЕННО без ссылки на регистрацию. Сквозной проход регистрация → `/pets/new` → 2 кредита **не прогонялся** в этой сессии |
| SEO-03.8 скриншоты 390/1440, Lighthouse | PARTIAL | Скриншоты 375 и 1440 сняты (папка `design-review/` в scratchpad сессии и в транскрипте); **Lighthouse не запускался** |

## SEO-04. Хабы, отравления, sitemap, «О материалах»

| Критерий | Результат | Доказательство |
|---|---|---|
| SEO-04.1 хабы по системам, «Когда сразу в клинику», крошки | PASS | `/simptomy/koshki` (24), `/simptomy/sobaki` (23), якоря систем органов, `EmergencySigns`; крошки с `aria-current` |
| SEO-04.2 шаблон отравления без доз, лилия — только кошки | PASS | `otravlenie/[slug]/page.tsx`; `liliya.json` — `bySpecies.cat` только; ревью отравлений: доз и порогов нет |
| SEO-04.3 sitemap только published, нет под `disallow` | PASS | 62 `<loc>`: главная, 3 хаба симптомов, 47 статей, хаб отравлений, 6 отравлений, `/o-materialah`, 3 юридических; тест `sitemap.test.ts` с `VERCEL_ENV=preview`; robots-префиксы — `content.test.ts` |
| SEO-04.4 `/o-materialah` честно описывает процесс | PASS | страница говорит прямо: черновик — модель, проверка — второй ИИ-агент, ветеринары не подписывают, адрес для ошибок |
| SEO-04.5 ссылки с хаба и 2–6 related, нет сирот | PASS | хабы перечисляют все страницы вида; `related` 2–6 у каждой (ревью), ссылки только на существующие (тест) |

## SEO-06. Контент первой волны

| Критерий | Результат | Доказательство |
|---|---|---|
| SEO-06.1 таблица Вордстата | NOT RUN | не заполнялась: все 53 страницы вышли одной партией, порядок не понадобился |
| SEO-06.2 процесс: черновик → ревью → публикация | PASS | 5 авторов-агентов по партиям → 5 ревьюеров первого круга (разбирали список сомнений автора) → 3 ревьюера второго круга с другой разбивкой и списком сквозных правил; все 53 файла `agent_reviewed` → `published` 2026-10-25 |
| SEO-06.3 тесты зелёные, ручная проверка трёх сценариев теста | PASS | `tests/unit/seo-content`: 15 тестов; сценарии ЭКСТРЕННО / СРОЧНО / НАБЛЮДАЕМ проверены в браузере на `rvota-u-koshki` |
| SEO-06.4 после деплоя 200 ботам, sitemap, переобход | NOT RUN | ветка не слита и не задеплоена |

## Ревью по готовому

- **Код-ревью** диффа (уровень high): 10 замечаний, 9 исправлены (границы matcher прокси; `publicPageMetadata` вместо ручного `openGraph`; `pathOf`; `publishedPages`; `textsOf` без служебных полей; `PublicFooter variant="articles"`; `Intl` для даты; twitter-image через реэкспорт), 1 оставлено (глобальная 404 под путями контента рендерится вне прокси — косметика).
- **Ревью дизайна** в браузере: 13 пунктов. Исправлены приоритеты 1–2 и часть 3: 404 внутри раздела ведёт на статьи; результат теста над вопросами, прокручивается и получает фокус; на телефоне ответ на первом экране (подпись и парная ссылка под ответом); кнопки Да/Нет 44 px, на телефоне во всю ширину; колонка 720 px и текст 16 px; хабы — короткие карточки с якорями систем (страница кошек на 375 px: 3 253 px вместо ~6 000); инлайн-ссылки в тексте; один дисклеймер в результате теста; «Похожие» сеткой; типограф против висячих предлогов (`typeset`, тест). Не делал: фирменный шрифт и логотип в OG-картинке (она та же, что у всего сайта).
- **Ревью статей**, спорные места, которые ревьюеры оставили владельцу: боль в животе у собаки — ЭКСТРЕННО на страницах рвоты и запора, СРОЧНО на «не ест» и «вялость»; запах ацетона — ЭКСТРЕННО по одному вопросу теста; антифриз, вопрос «был без присмотра в гараже» — широкий критерий; единственное число на страницах — порог жажды у собак «больше 100 мл/кг в сутки»; у кошки на инсулине совет не делать очередной укол при дрожи и звонить (единственное указание по препарату, предупреждающее).

## Команды и результаты

```
npm run typecheck --workspace=@lapka/web   # без ошибок
npm run lint --workspace=@lapka/web        # 0 ошибок, 4 старых предупреждения в tests/unit/contracts
npm run test --workspace=@lapka/web        # 80 файлов, 663 теста, зелёные
npm run build --workspace=@lapka/web       # 217 статических страниц, предупреждения только metadataBase от image-маршрутов
```

Изменённые файлы: `apps/web/src/app/(frontend)/layout.tsx` (перенос корневого), `app/(content)/**`, `app/global-not-found.tsx`, `app/fonts.ts`, `app/sitemap.ts`, `app/opengraph-image.tsx`, `app/styles/articles.css`, `src/features/seo-content/**`, `src/shared/{site-metadata,og-card,content-paths}.ts(x)`, `src/server/security/csp.ts`, `src/proxy.ts`, `src/components/site/PublicFooter.tsx`, словари (`site.symptoms`), `next.config.ts` (`globalNotFound`, CSP для путей контента), `apps/web/content/**` (53 статьи + README), тесты в `tests/unit/seo-content`, `tests/unit/shared/site-metadata.test.ts`, `tests/server/security/{csp,content-paths}.test.ts`. Миграций нет.

Проверенные старые сценарии: главная, `/legal`, `/register` отвечают как раньше (CSP с nonce, cookie, title); весь набор тестов web зелёный. Вход через провайдеров и кабинет вручную не прогонялись.

## Ограничения и известные дефекты

1. Решение по CSP `'unsafe-inline'` для путей контента ждёт подтверждения владельца (SEO-01.4).
2. Lighthouse и validator.schema.org не запускались (SEO-03.5, SEO-03.8) — сделать на Vercel-превью.
3. Скрипт `content:review-due` не написан (SEO-02.5).
4. SEO-00 (Вебмастер, Search Console, редирект `www`), SEO-05 (аналитика воронки), SEO-07 — не начаты.
5. Спорные медицинские места из раздела «Ревью статей» — решение владельца; страницы можно вернуть в `agent_reviewed`, чтобы не публиковать конкретную.

## Production, 25 октября 2026

PR vipanait/kotdok#88 слит владельцем (squash) 25 октября 2026 около 14:05 МСК; Vercel выкатил main за ~1 минуту. Проверка боевого домена через ru-proxy под UA YandexBot, Googlebot (smartphone) и Chrome — результат одинаков для всех трёх:

| Адрес | Код | Заметки |
|---|---|---|
| `/`, `/simptomy`, `/simptomy/koshki`, `/simptomy/sobaki`, `/otravlenie`, `/o-materialah` | 200 | статьи и хабы `x-vercel-cache: HIT`/`PRERENDER`, TTFB 0,75–1,5 с через прокси |
| `/simptomy/rvota-u-koshki`, `/simptomy/vzdutie-zhivota-u-sobaki`, `/otravlenie/liliya` | 200 | CSP без nonce, canonical и своя OG-картинка (200, image/png, 104 КБ), один блок JSON-LD |
| `/sitemap.xml` | 200 | 62 `<loc>` |
| `/robots.txt`, `/yandex_10acef97a3f92788.html` | 200 | файл подтверждения Вебмастера на месте |
| `/simptomy/net-takoy` | 404 | `noindex, nofollow` |
| `https://www.lapka.my/simptomy` | 308 → `https://lapka.my/simptomy` | редирект настроен владельцем в Vercel → Domains 25 октября (SEO-00.4) |

Ни одного `x-vercel-mitigated`, ни одной страницы Security Checkpoint; `server: nginx/1.28.3`. Главная, `/register` и `/api/v1/health` отвечают как раньше (200, nonce-CSP у главной).

Не сделано на момент отчёта: подтверждение в Яндекс.Вебмастере и Search Console, отправка sitemap, «Проверка ответа сервера» настоящим роботом (SEO-00.1–00.3, 00.5), Lighthouse и validator.schema.org.

Решение о приёмке и дата: слито в production владельцем 25 октября 2026.
