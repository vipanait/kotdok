# Google и Яндекс на staging: что и где создать

Инструкция для владельца проекта. Нужна для пункта **5/01** дорожной карты: без включённых
провайдеров в тестовом Supabase `signInWithOAuth` отвечает `Unsupported provider: provider is
not enabled` — это уже зафиксировано в [deployment.md](deployment.md).

Тестовых учётных данных от кого-то ещё не существует: приложения Google и Яндекса для staging
создаются заново, под ваш аккаунт. Production-приложения при этом не трогаются.

Секреты в репозиторий не попадают. Client ID и client secret живут только в панели Supabase
staging-проекта; в `.env`-файлах приложения они не нужны — обмен кода делает Supabase.

## Что уже есть в коде

| Факт | Где |
| --- | --- |
| Сайт зовёт `provider: 'google'` и `provider: 'custom:yandex'` | `apps/web/src/features/auth/AuthModal.tsx` |
| Возврат на сайт: `<origin>/auth/callback?next=…` | `apps/web/src/app/(backend)/auth/callback/route.ts` |
| Схема приложения — `lapka`, возврат в приложение `lapka://auth/callback` | `apps/mobile/src/lib/auth-links.ts` |
| Тестовый Supabase — `lapka-staging`, `rclnsbivyulqmvujiopv` | [deployment.md](deployment.md) |

Отсюда следует главное: **идентификатор яндексовского провайдера должен быть ровно
`custom:yandex`**, иначе придётся править код сайта. И **единственный redirect URI, который видят
Google и Яндекс, — адрес Supabase**:

```
https://rclnsbivyulqmvujiopv.supabase.co/auth/v1/callback
```

Ни `localhost`, ни `lapka://` в кабинеты провайдеров не вписываются: туда пользователя возвращает
уже Supabase, и разрешаются они в списке Redirect URLs самого Supabase (раздел 3).

## 1. Google

Кабинет: <https://console.cloud.google.com/auth/clients>.

Рекомендация — создать **новый OAuth-клиент в том же облачном проекте, где живёт production**.
Экран согласия (consent screen) настраивается на проект целиком: в общем проекте staging
наследует уже пройденную проверку и не упирается в ограничения непроверенного приложения.
Отдельный облачный проект тоже допустим, но тогда экран согласия придётся заполнять и, возможно,
проходить проверку заново.

1. Google Auth Platform → **Clients** → **Create client**.
2. Application type — **Web application**. Имя, по которому вы отличите его от боевого, например
   `Lapka staging (Supabase)`.
3. **Authorized redirect URIs** → добавить `https://rclnsbivyulqmvujiopv.supabase.co/auth/v1/callback`.
4. **Authorized JavaScript origins** для этого потока не требуются (браузер не делает JS-запрос к
   Google), поле можно оставить пустым.
5. Create → скопировать **Client ID** и **Client secret**.
6. Если экран согласия в статусе **Testing**, добавить в **Test users** те Google-аккаунты, которыми
   будете проверять вход. Иначе вход завершится ошибкой `access_denied`.
7. Supabase (проект `lapka-staging`) → **Authentication → Sign In / Providers → Google** → включить,
   вставить Client ID и Client secret → **Save**.

Отдельные Android- и iOS-клиенты Google **не нужны**: пункт 5/01 задаёт вход через системный
браузер с PKCE, Google в этом потоке общается только с Supabase. Клиенты с SHA-1 и bundle ID
понадобились бы для нативного Google Sign-In — это другой сценарий и другая приёмка.

Более короткий вариант, если не хотите второй клиент: добавить staging-callback в список redirect
URI боевого клиента. Тогда одна пара ключей обслуживает оба контура — при компрометации или ротации
ложится и production. Для теста это приемлемо, для постоянной схемы — нет.

## 2. Яндекс

Кабинет: <https://oauth.yandex.ru/>.

1. **Создать приложение**.
2. Тип — **«Для авторизации пользователей»**. Тип после регистрации не меняется, ошибиться здесь
   дороже всего.
3. Платформа — **веб-сервисы**. **Redirect URI**:
   `https://rclnsbivyulqmvujiopv.supabase.co/auth/v1/callback`.
   Поле **Suggest Hostname** на том же шаге оставить пустым: оно описывает страницу с виджетом
   автоподсказки аккаунтов, а не наш redirect-поток. Галки **iOS app** и **Android app** не
   ставить — они нужны для нативного SDK Яндекса, тогда как 5/01 задаёт системный браузер, и
   Яндекс видит только адрес Supabase.
4. Доступы — ровно два: **«доступ к адресу электронной почты»** (`login:email`) и **«доступ к
   логину, имени и фамилии, полу»** (`login:info`). Аватар, дата рождения и телефон приложению не
   нужны: аватары в интерфейсе только у питомцев и рисованные. Список доступов после регистрации
   редактируется.
5. Сохранить, скопировать **ClientID** и **Client secret**.

У Supabase нет встроенного провайдера Яндекса — используется custom provider. Дискавери-документа
у Яндекса нет (`https://oauth.yandex.ru/.well-known/openid-configuration` отвечает 404, проверено
8 сентября 2026), поэтому конфигурация только ручная.

Supabase → **Authentication → Sign In / Providers → Custom Providers → New Provider →
Manual configuration**:

| Поле | Значение |
| --- | --- |
| Identifier | `custom:yandex` — ровно так, это ищет код сайта |
| Client ID / Client Secret | из кабинета Яндекса |
| Authorization URL | `https://oauth.yandex.ru/authorize` |
| Token URL | `https://oauth.yandex.ru/token` |
| UserInfo URL | `https://login.yandex.ru/info?format=json` |
| Scopes | `login:email login:info` |

**Create and enable provider.** На бесплатном тарифе Supabase разрешает до трёх custom-провайдеров.

Одно место, где эта настройка может не завестись с первого раза: Яндекс отдаёт профиль полями
`id` и `default_email`, а не `sub` и `email`, и в документации разрешает только заголовок
`Authorization: OAuth …`. На практике `Bearer` он принимает, и на production связка работает —
но какие именно значения там стоят, из репозитория не видно. Если staging-вход упадёт на шаге
получения профиля, откройте production-проект Supabase, страницу того же `custom:yandex`, и
перенесите настройки один в один, меняя только ClientID/secret.

## 3. Общие настройки Supabase staging

**Authentication → URL Configuration**:

- **Site URL** — `http://localhost:3000` для локальной разработки против staging
  (`npm run dev:staging --workspace @lapka/web`).
- **Redirect URLs** — добавить:
  - `http://localhost:3000/auth/callback`
  - адрес preview-деплоя, если вход проверяется на нём (у Vercel-превью он свой на каждый деплой,
    поэтому удобнее шаблон вида `https://*-panaitvi-4639s-projects.vercel.app/auth/callback`);
  - `lapka://auth/callback` и `lapka://auth/recover` — возврат в мобильное приложение.

Без этого списка Supabase не отправит пользователя обратно, а вернёт его на Site URL — вход внешне
«проходит», но приложение сессию не получает.

## 4. Как убедиться, что готово

- Сайт локально против staging: кнопки Google и Яндекса доводят до кабинета, в
  **Authentication → Users** появляется пользователь с нужным провайдером.
- Отмена на экране провайдера возвращает на экран входа и не создаёт пользователя.
- Мобильная часть проверяется уже кодом этапа 5/01 — на реальных iOS и Android, как требует приёмка.
  Настройки из этого документа — предусловие, а не доказательство.

## 5. Владелец и ротация

Пункт 5/09 требует записанного владельца и срока ротации client secret. Для Google и Яндекса
секрет меняется в тех же кабинетах, после чего новое значение вставляется в Supabase; старое
перестаёт работать сразу, поэтому окно между двумя действиями — это простой входа.

| Провайдер | Где ротация | Владелец | Следующая ротация |
| --- | --- | --- | --- |
| Google (staging) | Google Auth Platform → Clients | *заполнить* | *заполнить* |
| Яндекс (staging) | oauth.yandex.ru → приложение | *заполнить* | *заполнить* |

## Источники

- [Supabase: Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase: Custom OAuth/OIDC Providers](https://supabase.com/docs/guides/auth/custom-oauth-providers)
- [Яндекс ID: регистрация приложения](https://yandex.ru/dev/id/doc/ru/register-client)
- [Яндекс ID: данные пользователя](https://yandex.ru/dev/id/doc/ru/user-information)
