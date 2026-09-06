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

**Ещё не сделано:** переменные окружения Preview в Vercel по-прежнему указывают на production. Чтобы это исправить, нужен service-role-ключ тестового проекта, а Management API его не отдаёт — значение берётся из настроек проекта в дашборде Supabase.

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

**Требует решения владельца.** Preview-окружение получает те же значения, что и production: любой preview-деплой любой ветки работает с боевым service-role-ключом Supabase, боевым ключом OpenAI и боевым Telegram-ботом. Кроме того, ключ service role и ключ OpenAI помечены Non-sensitive, то есть их значения читаются через настройки проекта и API. Это делает пункт 0/04 невыполненным и со стороны хостинга, а не только со стороны Supabase.

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
| Лимиты размера запроса и времени выполнения функций Vercel на текущем тарифе | Проверить пригодность для загрузки фото и синхронного анализа | Этапы 1 (числовые лимиты) и 6 |
| Разделение переменных Production и Preview | Preview сейчас работает с боевыми ключами | Этап 0, пункт 0/04 |
| Возможность запускать worker (длительность, периодичность, параллелизм) | Фоновая обработка анализа | **Этап 6** — пока зависимость явно блокирующая |
| Настройки резервного копирования и срок хранения копий | Политика удаления аккаунта | Этап 8 (пункт 8/09) |
| Тестовые подмены или отдельные назначения для AI, почты и Telegram | Тесты без реальных сообщений и расхода AI-бюджета | Этап 0, пункт 0/04 |
| OAuth-доступы (Google, Яндекс, Apple) | Вход в мобильном приложении | Этап 5 |

Пробная задача worker не запускалась: сначала нужно подтвердить хостинг. До этого подтверждения этап 6 считается заблокированным по инфраструктуре, а не готовым к реализации.

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
