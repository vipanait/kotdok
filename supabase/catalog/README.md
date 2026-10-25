# Справочник вакцин и обработок: данные

Здесь лежат строки таблицы `public.health_products`, а не схема. Схему создают миграции
[`20260925140000_health_catalog.sql`](../migrations/20260925140000_health_catalog.sql) (таблица,
уникальный индекс `health_products_name_kind` по `(kind, lower(name))`, политики) и
[`20261007120000_health_products_name_en.sql`](../migrations/20261007120000_health_products_name_en.sql)
(колонка `name_en`). Обе ссылаются на файлы этой папки, но ни один из них не выполняют:
`supabase db push`, `supabase db reset` и `supabase start` оставляют справочник пустым.

## Файлы

| Файл | Что это | Куда загружается |
| --- | --- | --- |
| `catalog-v1.sql` | Справочник v1: вакцины и средства от паразитов для кошек и собак, продающиеся в России. Собран 4 октября 2026 по открытым инструкциям, без проверки ветеринаром; владелец решил публиковать его как `verified = true` | Production и staging, вручную |
| `catalog-v2.sql` | Справочник v2: новые строки и две правки строк v1, всё через upsert. Выполняется после v1 | Production и staging, вручную |
| `catalog-names-en.sql` | Английские названия (`name_en`) для каждой строки v1 и v2, чьё название не латиницей. Выполняется после миграции `name_en` и после v1 и v2 | Production и staging, вручную |
| `draft-vaccines.sql` | Черновой список вакцин из спецификации медкарты (§5.4), `verified = false` | Только локальный и тестовый стенд |
| `draft-antiparasitics.sql` | Черновой список средств от паразитов оттуда же, `verified = false` | Только локальный и тестовый стенд |

## Как загружать

`catalog-v1`, `catalog-v2` и `catalog-names-en` применяются руками, строго в этом порядке и после
обеих миграций. Каждый файл можно выполнить повторно: строки ключуются по `(kind, lower(name))`,
повтор переписывает те же строки.

```bash
psql "$DATABASE_URL" -f supabase/catalog/catalog-v1.sql
```

```bash
psql "$DATABASE_URL" -f supabase/catalog/catalog-v2.sql
```

```bash
psql "$DATABASE_URL" -f supabase/catalog/catalog-names-en.sql
```

Черновики попадают только в локальный стек. Владельцам production показываются лишь строки
с `verified = true`; локальный и тестовый стенд видят и непроверенные, потому что в
`apps/web/.env.integration` стоит `HEALTH_CATALOG_INCLUDE_UNVERIFIED=1`.

```bash
docker exec -i supabase_db_kotdok psql -U postgres < supabase/catalog/draft-vaccines.sql
```

```bash
docker exec -i supabase_db_kotdok psql -U postgres < supabase/catalog/draft-antiparasitics.sql
```

Новая версия справочника — новый файл `catalog-v<N>.sql` из upsert-ов поверх прежних, а не правка
уже применённого: так видно, что и когда попало в production. Новые строки без латинского
названия получают `name_en` дописыванием в `catalog-names-en.sql`.
