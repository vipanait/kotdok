# Развёртывание и фактические ограничения

Документ ведётся по пункту **0/06** дорожной карты. Статус: **частично заполнен**. Каждая строка помечена источником; незаполненное считается непроверенным, а не «по умолчанию нормальным». Секреты и ключи в документ не попадают.

Последняя проверка: 6 сентября 2026, запуск `docs/verification/runs/stage-2/20260906-083630Z.md`.

## Хостинг сайта и API

| Параметр | Значение | Источник |
| --- | --- | --- |
| Платформа | Vercel, личный аккаунт `panaitvi-4639`, scope `panaitvi-4639s-projects`, команд нет | `vercel whoami`, `vercel project ls` |
| Проект | `kotdok`, `prj_07jOV73R0hWuHG2I9agVjzLS1SDv`, создан 13 апреля 2026 | `vercel project inspect kotdok` |
| Production URL | `https://lapka.my` | `vercel project ls` |
| Root Directory проекта | `.` | `vercel project inspect` |
| Node.js | 24.x — единственная общая версия: Vercel предлагает только 24.x, 22.x и 20.x, Node 25 это Current-релиз и там недоступен. Закреплена в `engines.node` и `.node-version`, CI использует её же | `vercel project inspect`, [документация Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) |
| Framework preset | Next.js; build и output — по умолчанию, переопределены корневым `vercel.json` | там же |
| Preview-деплои | создаются автоматически на push любой ветки | наблюдение: push `stage-0-baseline` дал preview |
| Защита preview | включена Vercel Deployment Protection: все пути отдают страницу входа Vercel | `curl` по выданному preview URL |
| Второй проект аккаунта | `dashboard` — к этому приложению отношения не имеет | `vercel project ls` |
| **Тариф** | **Hobby** | `GET /v2/user`, поле `billing.plan` |

### Фактические лимиты тарифа Hobby

| Лимит | Значение | Источник |
| --- | --- | --- |
| Тело запроса и ответа функции | **4.5 МБ**, сверх — `413 FUNCTION_PAYLOAD_TOO_LARGE` | [документация](https://vercel.com/docs/functions/limitations#request-body-size) и измерение на `lapka.my`: 1 МБ → 403 от приложения, 5 МБ → 413 от платформы |
| Время выполнения функции | 300 с по умолчанию и максимум (с Fluid compute, включён по умолчанию) | [документация](https://vercel.com/docs/functions/limitations#max-duration) |
| Память | 2 ГБ / 1 vCPU, изменить нельзя | там же |
| Cron: минимальный интервал | **раз в сутки**; более частое выражение роняет деплой | [документация](https://vercel.com/docs/cron-jobs/usage-and-pricing) |
| Cron: точность | ±59 минут | там же |
| Регион функций | один, `iad1`; несколько — только Pro | там же |

На Pro эти значения другие: тело запроса то же 4.5 МБ, время выполнения до 800 с (и до 1800 с в бете), cron раз в минуту с поминутной точностью.

После переноса в `apps/web` сборка на Vercel падала: собранное приложение лежит в `apps/web/.next`, а Vercel искал `.next` в корне. Настройка вынесена в корневой `vercel.json`, чтобы жить в репозитории, а не в параметрах проекта.

### Тестовый проект Supabase

| Параметр | Значение |
| --- | --- |
| Проект | `lapka-staging`, ref `rclnsbivyulqmvujiopv`, регион `ap-northeast-1` |
| URL | `https://rclnsbivyulqmvujiopv.supabase.co` |
| Схема | идентична production: отпечаток `5fe093e880c757afea4837f8115df45f`, 101 объект — совпадает с рабочей базой и с локальным стендом |
| История миграций | 18 версий, те же, что в репозитории и в production |
| Проверено | публичное чтение `packages` работает; прямая запись в `profiles` пользовательским ключом даёт 401; `consume_rate_limit` недоступна |

Публичные значения записаны в `apps/web/.env.test`. Service-role-ключ туда не попадает и в репозиторий не коммитится.

Preview и Development переведены на этот проект 6 сентября 2026.

**Ещё не настроено в тестовом проекте:** ни один OAuth-провайдер (Supabase отвечает `Unsupported provider: provider is not enabled`), почтовые шаблоны и Redirect URLs под preview-домены. Это понадобится на этапах 4 и 5 и не копируется из production.

### Переменные окружения

Имена и области действия (значения не выводились):

| Переменная | Окружения | Тип |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Production, Preview, Development | Non-sensitive |
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview, Development | Non-sensitive |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview, Development | Non-sensitive |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview, Development | Non-sensitive |
| `OPENAI_API_KEY` | Production, Preview, Development | Non-sensitive |
| `DUMMY_WEBHOOK_SECRET` | Production, Preview | Sensitive |
| `TELEGRAM_BOT_TOKEN` | Production, Preview | Sensitive |
| `TELEGRAM_APPROVAL_CHAT_ID` | Production, Preview | Sensitive |
| `TELEGRAM_WEBHOOK_SECRET` | Production, Preview | Sensitive |

**Исправлено 6 сентября 2026.** `SUPABASE_SERVICE_ROLE_KEY` разделён по окружениям: Production — боевой, Preview — от `lapka-staging`, оба помечены Sensitive; Development — staging-ключ (для Development пометка Sensitive недоступна). `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY` разделены так же. Проверено декодированием: Preview и Development указывают на тестовый проект, Production не тронут.

Пометка Sensitive проверена на деле: `vercel env pull` для production возвращает по service-role, Telegram-токену и вебхук-секретам заглушку вместо значения.

**Осталось:** `OPENAI_API_KEY` по-прежнему Non-sensitive и выгружается целиком; ключи OpenAI и Telegram по решению владельца остаются общими для Production и Preview — preview-сборки тратят боевой AI-бюджет и пишут в боевой чат согласования.

## Репозиторий и CI

| Параметр | Значение | Источник |
| --- | --- | --- |
| Репозиторий | `github.com/vipanait/kotdok` | `git remote -v` |
| CI | GitHub Actions, `.github/workflows/ci.yml` | файл в репозитории |
| Триггеры CI | push в `main`, любой pull request | тот же файл |
| Шаги CI | `npm ci` → `npm run lint` → `npm run test` → `npm run build` | тот же файл |
| Node в CI | 24 | тот же файл |
| Таймаут задачи CI | 15 минут | тот же файл |
| Интеграционные тесты в CI | не подключены | в workflow нет ни `test:integration`, ни сервиса Postgres |

Версия Node зафиксирована на 24.x в `engines.node` и `.node-version`; CI и Vercel используют её. Локальная машина может быть новее — 25.x работает, но целевая версия та, что указана в `engines`.

## База данных

| Параметр | Значение | Источник |
| --- | --- | --- |
| Проект Supabase | `bczseshsgpzulqynvukg`, регион `ap-northeast-1` | Supabase Management API, `list_projects` |
| PostgreSQL | 17.6.1.104 (engine 17, канал ga) | там же |
| Состояние | ACTIVE_HEALTHY, создан 13 апреля 2026 | там же |
| История миграций | приведена в соответствие с репозиторием: 18 версий, те же и в том же порядке, что локально и на staging | `list_migrations` |
| Тестовый проект | `rclnsbivyulqmvujiopv` — `lapka-staging`, тот же регион `ap-northeast-1`, создан 6 сентября 2026; стоимость $0/мес | `create_project`, `get_cost` |
| Локальный стенд | Supabase CLI 2.115.0 на Docker Engine 29.7.2; БД 127.0.0.1:54322, API 127.0.0.1:54321 | `supabase start` |
| Резервное копирование | **не проверено** | требуется доступ к настройкам проекта |

## Не проверено и блокирует

| Что | Зачем нужно | Что блокирует |
| --- | --- | --- |
| Разделение переменных Production и Preview | Preview сейчас работает с боевыми ключами | Этап 0, пункт 0/04 |
| Чем задача анализа подхватывается в обычном пути | Фоновая обработка анализа | **Этап 6**. Времени выполнения хватает — 300 с, суточного крона хватает для периодической уборки. Осталось выбрать быстрый подхват: событийный триггер (запрос создания, опрос статуса, `pg_net`) либо тариф Pro с cron раз в минуту |
| Настройки резервного копирования и срок хранения копий | Политика удаления аккаунта | Этап 8 (пункт 8/09) |
| Тестовые подмены или отдельные назначения для AI, почты и Telegram | Тесты без реальных сообщений и расхода AI-бюджета | Этап 0, пункт 0/04 |
| OAuth-доступы (Google, Яндекс, Apple) | Вход в мобильном приложении | Этап 5 |

**Загрузка фотографий через сервер невозможна на этом хостинге.** Приложение объявляет до пяти файлов по 5 МБ, то есть до 25 МБ в одном `multipart`-запросе, а платформа обрывает всё, что больше 4.5 МБ, ещё до вызова функции. Измерено на production: тело 1 МБ доходит до приложения и получает 403 от проверки CSRF, тело 5 МБ получает 413 от платформы. Значит фото должны идти напрямую в приватное хранилище Supabase по ограниченному разрешению, а сервер получать только идентификаторы — ровно то, что предусматривает этап 6. Это не улучшение архитектуры, а условие работоспособности.

Пробная задача worker не запускалась. Время выполнения не является препятствием: 300 секунд достаточно для анализа.

Суточный крон Hobby тоже не является препятствием для большей части фоновой работы. Он не подходит только там, где задержка видна пользователю, — быстрый подхват брошенного анализа. Вся периодическая уборка (просроченные загрузки, ключи идемпотентности, TTL квитанций удаления, приближение истечения Apple client secret, старые окна `api_rate_limits`) суточной частотой и точностью ±59 минут закрывается полностью. Полный разбор — в [jobs-uploads-deletion.md](jobs-uploads-deletion.md), раздел 2.

Значит вопрос не «какой взять планировщик», а «чем задача подхватывается в обычном пути»: крон здесь может быть подметальщиком, а не единственным триггером. Если подхват по событию окажется рабочим, тариф Pro не нужен. Ни один из вариантов не проверен.

Маршрут крона на Vercel описывается массивом `crons` в `vercel.json`, отвечает на `GET`, срабатывает только на production-деплое и обязан сверять заголовок `Authorization` со значением `Bearer ${CRON_SECRET}` — иначе он доступен всем. Ручной прогон для проверки: `vercel crons run <path>`. Источник: [документация](https://vercel.com/docs/cron-jobs/manage-cron-jobs). Сколько записей `crons` разрешено на Hobby — не проверено; один эндпоинт, выполняющий все суточные подметания последовательно, снимает вопрос.

## Известные предупреждения

Зафиксированы как исходное состояние, не исправлялись:

- Supabase security advisors: изменяемый `search_path` у `search_vet_knowledge`; расширение `vector` в схеме `public`; отключена защита от скомпрометированных паролей. Замечание про `handle_new_user()` закрыто — `EXECUTE` отозван у `public`, `anon` и `authenticated`.
- `npm audit`: 21 уязвимость (7 high, 13 moderate, 1 low), включая DoS в Next.js Server Components и наследованные уязвимости libvips через sharp. Обновление выполняется отдельным изменением безопасности до публикации.

## Локальный стенд для разработчика

```bash
npm ci
supabase start          # поднимает Postgres 127.0.0.1:54322 и API 127.0.0.1:54321
supabase db reset       # применяет все миграции на пустой базе
npm run test:integration
```

`npm run test:integration` читает `.env.integration`. Файл содержит только фиксированные публичные ключи локального стека Supabase, одинаковые на любой машине. Защита `tests/support/db-guard.ts` отказывает в разрушительных операциях для любого адреса, кроме `127.0.0.1:54322` / `127.0.0.1:54321`, и требует явного `ALLOW_DESTRUCTIVE_DB_RESET=true`.
