# Исполнимый план SRC-01 — источники в ответе проверки симптомов

> **Для агентов:** реализовывать по одной задаче через `superpowers:subagent-driven-development`
> либо `superpowers:executing-plans`. Шаги отмечаются чекбоксами.

**Цель:** под результатом проверки симптомов (приложение и веб-кабинет) виден список до трёх
материалов базы знаний, на которые опирался анализ: название, издатель, ссылка на оригинал.

**Подход:** найденные поиском фрагменты группируются в пронумерованные материалы; модель
возвращает номера использованных; сервер принимает только номера из найденного и сохраняет снимок
в `full_response.sources`. Клиенты читают снимок общей защитной функцией и рисуют блок. Миграций
и гейтинга нет.

**Стек:** Next.js 16.3 (Route Handlers, серверные компоненты), Supabase Postgres + pgvector,
OpenAI SDK (`gpt-5.4`, `text-embedding-3-small`), Expo / React Native, zod 4, vitest 4.

**Спека:** [2026-11-13-check-answer-sources-design.md](../specs/2026-11-13-check-answer-sources-design.md)

## Общие ограничения

- Ветка `claude/check-answer-sources-25866a`. В `main` не мержить, EAS Update не выпускать.
- Коммиты по-английски, одним предложением в стиле истории репозитория, последняя строка
  `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- **Миграций нет.** `SymptomCheckRecordSchema`, `X-Lapka-Features`, `search_vet_knowledge`,
  `docs/api/openapi.yaml` не меняются. `supabase db reset` не запускать: локальная база общая.
- `packages/*` остаются переносимыми: без Next.js, серверных SDK и DOM.
- Перед правкой `apps/web` прочитать нужный гайд в `node_modules/next/dist/docs/` (AGENTS.md).
- Источников не больше `CHECK_SOURCES_MAX = 3`. Порог `VET_CONTEXT_MIN_SIMILARITY = 0.3` до
  пробы (задача 7).
- Издатели и хосты — ровно:
  `vca` → «VCA Animal Hospitals», `vcahospitals.com`;
  `merck` → «Merck Veterinary Manual», `www.merckvetmanual.com`;
  `cornell` → «Cornell University College of Veterinary Medicine», `vet.cornell.edu` и
  `www.vet.cornell.edu`.
- Недоступные URL, которые в источники не попадают (сверить точные адреса с базой в задаче 7):
  Cornell `…/pet-food-and-toy-recalls`, VCA `…/diarrhea-questionnaire-and-checklist-for-cats`,
  VCA `…/chinese-crested-dog`. Сравнение — по окончанию пути URL.
- Тексты блока:

  | Ключ | ru | en |
  | --- | --- | --- |
  | заголовок | Материалы, на которые опирался анализ | Materials the analysis relied on |
  | пометка | на английском | in English |
  | подпись | Ответ составлен ИИ и не является цитатой этих изданий. | The answer was written by AI and is not a quotation from these publications. |

- Сессия про уточняющие вопросы правит те же экраны и `analysis-language.ts`. Здесь — одна строка
  в скелете ответа модели и один вызов компонента на каждом экране; ничего рядом не
  переформатировать.

## На что смотреть в ревью

1. Модель вернула `used_sources` строками (`["1", "2"]`) или числом вместо массива — источников
   нет, анализ не падает. Тест в задаче 2.
2. Все фрагменты ниже порога, но поиск не пустой — контекст «No additional context available.»,
   а не пустая строка, `sources: []`. Тест в задаче 2.
3. Модель отметила материал с пустым названием, а следом три годных — в снимке три годных
   (фильтр годности раньше обрезки до трёх). Тест в задаче 2.
4. В `full_response.sources` старой или испорченной проверки лежит строка, объект или массив
   с `url: "javascript:…"` — `checkSources` возвращает пусто, экран открывается. Тест в задаче 1.
5. Очень длинное название статьи (Cornell, до 80 символов и больше) не ломает строку блока на
   узком экране: переносится, стрелка не уезжает. Проверка глазами в задаче 5 и 6.

---

### Задача 1. Контракт источника и защитное чтение

**Файлы:**
- Изменить: `packages/contracts/src/check.ts`
- Создать: `packages/shared/src/checks/check-sources.ts`, `packages/shared/src/checks/check-sources.test.ts`
- Изменить: `packages/shared/src/index.ts` (одна строка реэкспорта)

**Интерфейсы — даёт:**
- `CheckSourceSchema = z.object({ title: z.string().min(1), publisher: z.string().min(1), url: z.url(), lang: LocaleSchema })` — **не** `strictObject`; `type CheckSource`; `CHECK_SOURCES_MAX = 3`.
- `checkSources(full: Record<string, unknown> | null): CheckSource[]` в `@lapka/shared`.
- Комментарий у `full_response` в `SymptomCheckRecordSchema`: ключ `sources` и ссылка на `CheckSourceSchema`.

- [ ] **Шаг 1. Тесты** `check-sources.test.ts`:
  - `null`, `{}`, `{ sources: 'x' }`, `{ sources: {} }` → `[]`;
  - один годный элемент возвращается как есть; лишний ключ в элементе не мешает;
  - элемент без `title`, с `url: 'http://vcahospitals.com/a'`, с `url: 'javascript:alert(1)'`,
    с `lang: 'de'` — пропущен, соседний годный остался;
  - пять годных → первые три.
- [ ] **Шаг 2.** `npm run test --workspace @lapka/shared -- check-sources` — падает: модуля нет.
- [ ] **Шаг 3.** Схема в контракте; `checkSources`: не массив → `[]`; каждый элемент через
  `safeParse`; дополнительно URL должен начинаться с `https://`; обрезка до `CHECK_SOURCES_MAX`.
- [ ] **Шаг 4.** Тесты проходят; `npm run typecheck`.
- [ ] **Шаг 5.** Коммит: `Contracts: a check source and a guarded reader for full_response.sources`.

### Задача 2. Материалы контекста и отбор источников (чистая логика)

**Файлы:**
- Создать: `apps/web/src/server/symptom-check/vet-sources.ts`
- Тест: `apps/web/tests/server/symptom-check/vet-sources.test.ts`

**Интерфейсы — потребляет:** `CheckSource`, `CHECK_SOURCES_MAX` из задачи 1.

**Интерфейсы — даёт:**

```ts
export const VET_CONTEXT_MIN_SIMILARITY = 0.3
export const NO_VET_CONTEXT = 'No additional context available.'
export type VetKnowledgeMatch = {
  content: string
  source_title: string | null
  source_url: string | null
  source_name: string | null
  similarity: number
}
/** Статья, собранная из её фрагментов; number — с 1, по лучшему сходству. */
export type VetMaterial = { number: number; title: string; url: string | null; publisherKey: string | null; chunks: string[] }
export function groupMaterials(rows: VetKnowledgeMatch[]): VetMaterial[]
export function renderVetContext(materials: VetMaterial[]): string
export function parseUsedSources(raw: unknown, materialCount: number): number[]
export function pickSources(materials: VetMaterial[], rawUsed: unknown): CheckSource[]
```

- [ ] **Шаг 1. Тесты:**
  - `groupMaterials`: строки со сходством `0.3` и ниже отброшены (граница строгая, как сейчас);
    два фрагмента с одним `source_url` → один материал с двумя `chunks`; номера 1…n по убыванию
    лучшего сходства; строка с `source_url: null` — отдельный материал;
  - `renderVetContext([])` → `NO_VET_CONTEXT`; иначе каждый фрагмент начинается с `[N] Название`,
    фрагменты разделены `\n\n---\n\n`;
  - `parseUsedSources`: `[2, 1]` при трёх материалах → `[2, 1]`; `[1, 1, 5, 0, -1, 1.5, '2', null]`
    → `[1]`; `'1'`, `1`, `undefined`, `{}` → `[]`;
  - `pickSources`: годный материал → `{ title, publisher: 'VCA Animal Hospitals', url, lang: 'en' }`;
    название обрезано `trim`; отброшены: пустое название, `http://`, хост `evil.example` при
    издателе `vca`, хост Merck при издателе `vca`, неизвестный издатель, каждый из трёх
    недоступных URL; отмечены `[плохой, a, b, c, d]` → `[a, b, c]`; пустые материалы или пустые
    отметки → `[]`.
- [ ] **Шаг 2.** `npm run test --workspace @lapka/web -- vet-sources` — падает.
- [ ] **Шаг 3.** Реализация. Таблицы издателей и недоступных URL — константы модуля, значения из
  «Общих ограничений». URL разбирать через `new URL` в `try`; сравнивать `protocol` и `hostname`.
  Файл без `import 'server-only'` и без `next/*`: чистые функции.
- [ ] **Шаг 4.** Тесты проходят.
- [ ] **Шаг 5.** Коммит: `Web: number vet materials in the context and pick the ones the model used`.

### Задача 3. Анализ сохраняет источники

**Файлы:**
- Изменить: `apps/web/src/server/symptom-check/analysis-language.ts` (скелет ответа)
- Изменить: `apps/web/src/server/symptom-check/analyze-symptom-check.ts` (`getVetContext`, вставка)
- Тесты: `apps/web/src/server/symptom-check/analysis-language.test.ts`,
  `apps/web/tests/integration/sources-01.test.ts`

**Интерфейсы — потребляет:** всё из задачи 2.

- [ ] **Шаг 1. Тест промпта:** `outputFormat('ru')` и `outputFormat('en')` содержат
  `"used_sources": [1, 2]` и предложение-правило (текст ниже).
- [ ] **Шаг 2. Интеграционный тест** `sources-01.test.ts` по образцу
  `tests/integration/medical-record-10.test.ts` (там же способ подмены `openai` через `vi.mock`).
  Поиск подменяется: `supabase.rpc('search_vet_knowledge')` оборачивается так, чтобы вернуть
  заданные строки (в локальной базе корпуса нет). Случаи:
  - два фрагмента одной статьи VCA и один Merck, модель вернула `used_sources: [2, 1, 9]` →
    в сохранённой строке `full_response.sources` два источника в порядке модели, `used_sources`
    в `full_response` нет; системный промпт, ушедший в модель, содержит `[1] ` и `[2] `;
  - модель не вернула `used_sources` → `sources` равен `[]`, проверка сохранена, кредит списан;
  - поиск вернул ошибку → `sources` равен `[]`, промпт содержит `NO_VET_CONTEXT`;
  - сохранённая запись, прочитанная через `mapSymptomCheckRow`, проходит `SymptomCheckRecordSchema`
    (критерий 10: схема в этой ветке не менялась — проверить `git diff main -- packages/contracts/src/check.ts`
    на отсутствие правок внутри `SymptomCheckRecordSchema`, кроме комментария).
- [ ] **Шаг 3.** Оба теста падают.
- [ ] **Шаг 4. Скелет:** в `outputFormat` после строки `vet_questions` добавить
  `"used_sources": [1, 2],` и после блока CONSISTENCY, перед `CONTEXT FROM VET DATABASE:`, абзац:

  ```
  SOURCES: entries in CONTEXT FROM VET DATABASE are numbered like [1]. In used_sources list the numbers of the entries you actually relied on for this answer, most important first. Use only numbers that appear in the context. If you relied on none, or there is no context, return [].
  ```

- [ ] **Шаг 5. Анализ:** `getVetContext` возвращает `{ context: string; materials: VetMaterial[] }`
  (ошибка или пустой поиск → `{ context: NO_VET_CONTEXT, materials: [] }`); порог берётся из
  `VET_CONTEXT_MIN_SIMILARITY`. После разбора JSON:
  `const sources = pickSources(materials, (parsed as Record<string, unknown>).used_sources)`.
  В `full_response` вставки добавить `sources` отдельным ключом. `validateAIResponse` и
  `SymptomCheckResult` не трогать — так `used_sources` не попадёт в `full_response`.
- [ ] **Шаг 6.** `npm run test --workspace @lapka/web` и
  `npm run test:integration -- sources-01` проходят (нужен запущенный локальный Supabase).
- [ ] **Шаг 7.** Коммит: `Web: a check keeps the sources its analysis relied on`.

### Задача 4. Тексты блока в словарях

**Файлы:**
- Изменить: `apps/mobile/src/i18n/ru.ts`, `apps/mobile/src/i18n/en.ts` (раздел `result`)
- Изменить: `apps/web/src/shared/i18n/dictionaries/ru.ts`, `…/en.ts` (раздел `check`)
- Тест: `apps/mobile/src/i18n/i18n.test.ts`

**Интерфейсы — даёт:** приложение — `t.result.sourcesTitle`, `t.result.sourceInEnglish`,
`t.result.sourcesNote`, `t.result.openSource` (подпись для скринридера: «Открыть источник» /
«Open the source»); сайт — `dict.check.sourcesTitle`, `dict.check.sourceInEnglish`,
`dict.check.sourcesNote`. Значения — из таблицы «Общих ограничений».

- [ ] **Шаг 1.** Тест: в обоих словарях приложения четыре ключа непустые. Падает.
- [ ] **Шаг 2.** Добавить ключи. Проходит; `npm run typecheck` (тип словаря сайта выводится из `ru.ts`).
- [ ] **Шаг 3.** Коммит: `Web + Mobile: words for the sources block`.

### Задача 5. Блок источников в приложении

**Файлы:**
- Создать: `apps/mobile/src/features/checks/CheckSources.tsx`
- Создать: `apps/mobile/src/features/checks/check-sources-view.ts`, `…/check-sources-view.test.ts`
- Изменить: `apps/mobile/src/features/checks/CheckResult.tsx` (один вызов)

**Интерфейсы — потребляет:** `checkSources` (задача 1), ключи словаря (задача 4).

**Интерфейсы — даёт:**
`sourceLines(t: Dictionary, sources: CheckSource[], locale: Locale): { title: string; caption: string; url: string }[]`
— `caption` равен издателю, а при `source.lang !== locale` — `Издатель · пометка`.

- [ ] **Шаг 1. Тесты** `check-sources-view.test.ts` (тесты приложения — только чистая логика,
  окружение `node`): русский результат и источник `en` → `VCA Animal Hospitals · на английском`;
  английский результат → `VCA Animal Hospitals`; пустой список → `[]`.
- [ ] **Шаг 2.** Падает.
- [ ] **Шаг 3.** `sourceLines`; компонент `CheckSources({ check })`: `checkSources(check.full_response)`,
  при пустом списке `null`; словарь — `dictionary(check.locale)`. Заголовок тем же вариантом
  текста, что у `Bullets`; каждая строка — `Pressable` с `accessibilityRole="link"` и
  `accessibilityLabel` из `openSource` и названия, по нажатию `Linking.openURL(url)`; название
  переносится по словам, издатель — `variant="label" tone="muted"`; под списком подпись
  `tone="faint"`. Размеры и отступы — из `tokens`, как у соседних блоков.
- [ ] **Шаг 4.** В `CheckResult.tsx` вставить `<CheckSources check={check} />` сразу перед
  `<Banner text={t.result.disclaimer} />`.
- [ ] **Шаг 5.** `npm run test --workspace @lapka/mobile`, `npm run lint`, `npm run typecheck`.
- [ ] **Шаг 6. Проверка на симуляторе** (рецепт запуска — память `expo-dev-env-local-override`):
  новая проверка с источниками показывает блок перед дисклеймером; нажатие открывает Safari;
  проверка без ключа `sources` — без блока; длинное название переносится. Скриншоты — в
  `docs/verification/sources-01/` (не коммитить).
- [ ] **Шаг 7.** Коммит: `Mobile: the result names the materials the analysis relied on`.

### Задача 6. Блок источников на сайте

**Файлы:**
- Создать: `apps/web/src/features/symptom-check/CheckSources.tsx`
- Изменить: `apps/web/src/features/symptom-check/CheckResultContent.tsx` (один вызов)
- Изменить: файл стилей, где описан `.result-disclaimer` (найти `grep -rn "result-disclaimer" apps/web/src`)
- Тест: `apps/web/tests/unit/components/check-sources.test.tsx`

**Интерфейсы — потребляет:** `checkSources` (задача 1), ключи словаря (задача 4).

**Интерфейсы — даёт:** `CheckSources({ fullResponse, dict, locale }: { fullResponse: Record<string, unknown> | null; dict: Dictionary; locale: Locale })`
— серверный компонент без хуков; язык блока — язык страницы.

- [ ] **Шаг 1. Тесты** через `render` из `tests/unit/components/static-render.tsx`:
  - два источника → два `<a>` с `href`, `target="_blank"`, `rel="noopener noreferrer"`; у названия
    `lang="en"`; есть заголовок и подпись из словаря;
  - страница `ru`, источник `en` → рядом с издателем «на английском»; страница `en` → пометки нет;
  - `fullResponse` без `sources` и `null` → пустая разметка.
- [ ] **Шаг 2.** Падает.
- [ ] **Шаг 3.** Компонент: `<div className="result-sources">`, заголовок `<h3>`, список `<ul>`,
  подпись `<p className="footnote">`. В `CheckResultContent.tsx` вставить
  `<CheckSources fullResponse={check.full_response} dict={dict} locale={locale} />` внутри
  карточки «Подробности проверки», после `</div>` блока `result-details` и перед
  `<p className="footnote result-disclaimer">`. Стили — в духе соседних (`.result-details`),
  длинное название переносится (`overflow-wrap: anywhere`).
- [ ] **Шаг 4.** `npm run test --workspace @lapka/web`, `npm run lint`, `npm run typecheck`.
- [ ] **Шаг 5. Проверка в браузере** на записи `web-staging-prod` из `.claude/launch.json`
  (память `browser-pane-no-hydration`; порт 3200 занят другими сессиями): страница результата с
  источниками — блок над дисклеймером, ссылка открывается в новой вкладке; старая проверка — без
  блока; ширина 375 — без горизонтальной прокрутки. Скриншоты — в `docs/verification/sources-01/`.
- [ ] **Шаг 6.** Коммит: `Web: the result page names the materials the analysis relied on`.

### Задача 7. Цифры по production и проба порога (хвост владельца)

**Файлы:**
- Создать: `apps/web/scripts/vet-knowledge-stats.sql` (запрос из спеки: заполненность полей по
  издателям и видам, образцы названий; только `select`)
- Создать: `apps/web/scripts/vet-similarity-probe.mjs`, `apps/web/scripts/vet-similarity-queries.json`

**Интерфейсы:** скрипт читает `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` из
окружения, ничего не пишет в базу. Для каждого запроса из JSON (`{ text, species, kind: 'typical' | 'offtopic' }`)
делает тот же эмбеддинг (`text-embedding-3-small`) и тот же вызов
`search_vet_knowledge(match_count: 5, filter_species)`; печатает Markdown-таблицу: запрос, пять
значений сходства, название первого материала.

- [ ] **Шаг 1.** Набор из 30 запросов: 14 русских и 8 английских типичных жалоб (рвота, понос,
  хромота, отказ от еды, зуд, кашель, кровь в моче, судороги и т. п., кошки и собаки поровну),
  8 посторонних (переноска, кличка, стрижка, корм по цене и т. п.). Жалобы сочинить, реальные
  тексты пользователей не брать.
- [ ] **Шаг 2.** Скрипт и SQL. Проверка без production: `node apps/web/scripts/vet-similarity-probe.mjs --dry-run`
  печатает список запросов и выходит с кодом 0.
- [ ] **Шаг 3.** Коммит: `Web: a read-only probe for the vet context similarity threshold`.
- [ ] **Шаг 4. Владелец** запускает (или разрешает запуск) против production:

  ```bash
  supabase db query --linked --project-ref bczseshsgpzulqynvukg -f apps/web/scripts/vet-knowledge-stats.sql
  ```

  и пробу с ключами из `/Users/skyeng/dev/petcheck/.env`. Вывод — в отчёт.
- [ ] **Шаг 5.** По таблице выбрать порог: наибольшее значение, при котором каждый типичный
  запрос сохраняет хотя бы один материал, а посторонние — ни одного; если так не делится,
  записать это в отчёт и оставить выбор владельцу. Поправить `VET_CONTEXT_MIN_SIMILARITY` и тест
  границы в задаче 2; сверить три недоступных URL с базой. Коммит:
  `Web: the vet context threshold is set from the probe`.

### Задача 8. Отчёт и роадмап

**Файлы:**
- Создать: `docs/verification/sources-01.md` по `docs/verification/REPORT_TEMPLATE.md`
- Изменить: `docs/mobile-api-plan.md` — раздел «Источники в ответе проверки» после «Цикл
  наблюдения после проверки»: зачем, решения владельца от 13 ноября 2026, ссылки на спеку, план и
  отчёт, критерии SRC-01/01…15 из спеки.

- [ ] **Шаг 1.** Полный прогон: `npm run lint`, `npm run typecheck`, `npm run test`,
  `npm run test:integration`. Команды и результаты — в отчёт.
- [ ] **Шаг 2.** Матрица приёмки: 15 строк, у каждой способ проверки и фактический результат.
  Критерии 12 и 13 остаются `NOT RUN`, пока не выполнена задача 7, шаги 4–5; статус отчёта до
  тех пор `IN_PROGRESS`.
- [ ] **Шаг 3.** Коммит: `Docs: SRC-01 report and the roadmap section`.

## Соответствие критериям спеки

| Критерий | Задача |
| --- | --- |
| 1, 5, 10 | 3 |
| 2, 3, 4 | 2 (логика), 3 (сквозной случай) |
| 6 | 5 |
| 7 | 6 |
| 8 | 5 (приложение), 6 (сайт) |
| 9 | 1 (чтение), 5 и 6 (экраны) |
| 11 | 1 |
| 12, 13 | 7 |
| 14, 15 | 8 |
