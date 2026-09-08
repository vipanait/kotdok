# Исполнимый план 5/01 — вход через Google и Яндекс в приложении

> **Для агентов:** реализовывать по одной задаче через `superpowers:subagent-driven-development`
> либо `superpowers:executing-plans`. Шаги отмечаются чекбоксами.

**Цель:** кнопки «Войти с Яндекс ID» и «Продолжить с Google» в мобильном приложении приводят к
настоящей сессии Supabase через системный браузер.

**Подход:** `signInWithOAuth({ skipBrowserRedirect: true })` отдаёт адрес авторизации,
`WebBrowser.openAuthSessionAsync` открывает его в `ASWebAuthenticationSession` (iOS) или Custom Tabs
(Android) и возвращает адрес возврата в вызвавший код, `exchangeCodeForSession` превращает код в
сессию. Логика отделена от нативных модулей фабрикой с зависимостями — как `createRefreshCoordinator`
в этом же каталоге, — поэтому тестируется в node без симулятора.

**Стек:** Expo SDK 57, React Native 0.86, `@supabase/supabase-js` 2.103, `expo-web-browser`, vitest 4.

**Спека:** [2026-09-08-stage-5-01-provider-sign-in-design.md](../specs/2026-09-08-stage-5-01-provider-sign-in-design.md)

## Общие ограничения

- Адрес возврата провайдерского входа — `lapka://auth/provider`. Он добавлен в Redirect URLs
  staging-проекта владельцем 8 сентября 2026. Путь писем (`lapka://auth/callback`) не трогаем.
- Идентификаторы провайдеров ровно такие: `google` и `custom:yandex`. Второй совпадает с тем, что
  зовёт сайт и что заведено в Supabase.
- Тексты для пользователя — по-русски, без технических кодов ошибок.
- Отмена — не ошибка и не сообщение: экран входа возвращается молча. Сбой — `Banner` с тоном `error`.
- Внешние провайдеры в автоматических тестах не вызываются: браузер и клиент Supabase подменяются.
- Файлы мобильного приложения не импортируют Next.js и серверные SDK; `packages/*` не трогаем.
- Android в этот заход не проверяется. Ни один пункт отчёта не помечается пройденным на Android.

---

### Задача 1. Адрес возврата и его разбор

**Файлы:**
- Изменить: `apps/mobile/src/lib/auth-links.ts`
- Тесты: `apps/mobile/src/lib/auth-links.test.ts`

**Интерфейсы:**
- Отдаёт: `PROVIDER_RETURN_URL: string` (`'lapka://auth/provider'`),
  `parseProviderReturn(raw: string): ProviderReturn | null`, где
  `type ProviderReturn = { kind: 'code'; code: string } | { kind: 'error'; code: string; description: string | null }`.
- `parseAuthLink` остаётся прежней и обязана возвращать `null` для провайдерского пути.

- [ ] **Шаг 1: Написать падающие тесты**

В `apps/mobile/src/lib/auth-links.test.ts` добавить:

```ts
import { PROVIDER_RETURN_URL, parseProviderReturn } from './auth-links'

describe('provider return', () => {
  it('reads the code out of the return address', () => {
    expect(parseProviderReturn(`${PROVIDER_RETURN_URL}?code=abc123`)).toEqual({
      kind: 'code',
      code: 'abc123',
    })
  })

  it('reads the provider error instead of a code', () => {
    expect(
      parseProviderReturn(`${PROVIDER_RETURN_URL}?error=access_denied&error_description=Denied`),
    ).toEqual({ kind: 'error', code: 'access_denied', description: 'Denied' })
  })

  it('ignores an address that is not ours', () => {
    expect(parseProviderReturn('https://evil.example.com/auth/provider?code=abc')).toBeNull()
    expect(parseProviderReturn('lapka://auth/callback?code=abc')).toBeNull()
    expect(parseProviderReturn('lapka://auth/provider')).toBeNull()
  })

  it('is not treated as an email link', () => {
    expect(parseAuthLink(`${PROVIDER_RETURN_URL}?code=abc123`)).toBeNull()
  })
})
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

Запустить: `npm run test --workspace @lapka/mobile`
Ожидание: FAIL, `PROVIDER_RETURN_URL` и `parseProviderReturn` не экспортируются.

- [ ] **Шаг 3: Реализовать**

В `apps/mobile/src/lib/auth-links.ts` рядом с `APP_SCHEME`:

```ts
/**
 * Where a provider sends the user back after the system browser.
 *
 * Deliberately not the address the emails use. On Android the browser hands the
 * link to the system as well, so a shared path would let the global link
 * listener exchange the same code a second time — the first exchange has
 * already spent it, and the user would see a failure after a successful sign-in.
 * `parseAuthLink` does not know this path, so it ignores it.
 */
export const PROVIDER_RETURN_PATH = 'auth/provider'
export const PROVIDER_RETURN_URL = `${APP_SCHEME}://${PROVIDER_RETURN_PATH}`

export type ProviderReturn =
  | { kind: 'code'; code: string }
  | { kind: 'error'; code: string; description: string | null }

/** @returns what the provider sent back, or null when the address is not ours. */
export function parseProviderReturn(raw: string): ProviderReturn | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }

  if (url.protocol !== `${APP_SCHEME}:`) return null
  if (`${url.host}${url.pathname}`.replace(/\/+$/, '') !== PROVIDER_RETURN_PATH) return null

  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''))
  const read = (key: string) => url.searchParams.get(key) ?? fragment.get(key)

  const error = read('error') ?? read('error_code')
  if (error) return { kind: 'error', code: error, description: read('error_description') }

  const code = read('code')
  return code ? { kind: 'code', code } : null
}
```

- [ ] **Шаг 4: Убедиться, что тесты проходят**

Запустить: `npm run test --workspace @lapka/mobile`
Ожидание: PASS, включая прежние тесты `parseAuthLink`.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/mobile/src/lib/auth-links.ts apps/mobile/src/lib/auth-links.test.ts
git commit -m "Give the provider return its own path."
```

---

### Задача 2. Логика входа провайдером

**Файлы:**
- Создать: `apps/mobile/src/lib/provider-sign-in.ts`
- Тесты: `apps/mobile/src/lib/provider-sign-in.test.ts`

**Интерфейсы:**
- Использует из задачи 1: `PROVIDER_RETURN_URL`, `parseProviderReturn`.
- Отдаёт: `type ProviderId = 'google' | 'custom:yandex'`;
  `type ProviderOutcome = { kind: 'session' } | { kind: 'cancelled' } | { kind: 'failed'; message: string }`;
  `createProviderSignIn(deps: ProviderSignInDeps): (provider: ProviderId) => Promise<ProviderOutcome>`;
  `type ProviderSignInDeps = { authorize(provider: ProviderId, redirectUrl: string): Promise<{ url: string | null; error: { message: string } | null }>; openBrowser(url: string, redirectUrl: string): Promise<{ type: string; url?: string }>; exchangeCode(code: string): Promise<{ error: { message: string } | null }> }`.

- [ ] **Шаг 1: Написать падающие тесты**

Создать `apps/mobile/src/lib/provider-sign-in.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { PROVIDER_RETURN_URL } from './auth-links'
import { createProviderSignIn, type ProviderSignInDeps } from './provider-sign-in'

function deps(overrides: Partial<ProviderSignInDeps> = {}): ProviderSignInDeps {
  return {
    authorize: vi.fn(async () => ({ url: 'https://oauth.yandex.ru/authorize?x=1', error: null })),
    openBrowser: vi.fn(async () => ({ type: 'success', url: `${PROVIDER_RETURN_URL}?code=abc` })),
    exchangeCode: vi.fn(async () => ({ error: null })),
    ...overrides,
  }
}

describe('provider sign-in', () => {
  it('exchanges the returned code for a session', async () => {
    const d = deps()
    const signIn = createProviderSignIn(d)

    await expect(signIn('custom:yandex')).resolves.toEqual({ kind: 'session' })
    expect(d.authorize).toHaveBeenCalledWith('custom:yandex', PROVIDER_RETURN_URL)
    expect(d.exchangeCode).toHaveBeenCalledWith('abc')
  })

  it('reports a closed browser as a cancellation, not a failure', async () => {
    const d = deps({ openBrowser: vi.fn(async () => ({ type: 'cancel' })) })

    await expect(createProviderSignIn(d)('google')).resolves.toEqual({ kind: 'cancelled' })
    expect(d.exchangeCode).not.toHaveBeenCalled()
  })

  it('fails when the provider refuses', async () => {
    const d = deps({
      openBrowser: vi.fn(async () => ({
        type: 'success',
        url: `${PROVIDER_RETURN_URL}?error=access_denied`,
      })),
    })

    const outcome = await createProviderSignIn(d)('google')

    expect(outcome.kind).toBe('failed')
    expect(d.exchangeCode).not.toHaveBeenCalled()
  })

  it('does not exchange a code that came back to somebody else address', async () => {
    const d = deps({
      openBrowser: vi.fn(async () => ({
        type: 'success',
        url: 'https://evil.example.com/auth/provider?code=abc',
      })),
    })

    expect((await createProviderSignIn(d)('google')).kind).toBe('failed')
    expect(d.exchangeCode).not.toHaveBeenCalled()
  })

  it('fails when authorization could not even start', async () => {
    const d = deps({
      authorize: vi.fn(async () => ({ url: null, error: { message: 'provider is not enabled' } })),
    })

    expect((await createProviderSignIn(d)('custom:yandex')).kind).toBe('failed')
    expect(d.openBrowser).not.toHaveBeenCalled()
  })

  it('fails when the code is refused, and says so once', async () => {
    const d = deps({ exchangeCode: vi.fn(async () => ({ error: { message: 'invalid request' } })) })

    expect((await createProviderSignIn(d)('google')).kind).toBe('failed')
    expect(d.exchangeCode).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

Запустить: `npm run test --workspace @lapka/mobile`
Ожидание: FAIL, модуль `./provider-sign-in` не найден.

- [ ] **Шаг 3: Реализовать**

Создать `apps/mobile/src/lib/provider-sign-in.ts`:

```ts
/**
 * Signing in with Google or Yandex ID through the system browser.
 *
 * The native modules arrive as dependencies rather than imports, so the
 * decisions here — what counts as a cancellation, which address may be
 * exchanged, what the user is told — are testable without a simulator.
 */

import { PROVIDER_RETURN_URL, parseProviderReturn } from './auth-links'

export type ProviderId = 'google' | 'custom:yandex'

export type ProviderOutcome =
  /** The session exists; the screens react to the auth state, not to this value. */
  | { kind: 'session' }
  /** The user closed the browser. Not an error. */
  | { kind: 'cancelled' }
  | { kind: 'failed'; message: string }

export type ProviderSignInDeps = {
  /** Asks Supabase for the provider's authorization address without leaving the app. */
  authorize(
    provider: ProviderId,
    redirectUrl: string,
  ): Promise<{ url: string | null; error: { message: string } | null }>
  /** Opens the system browser and resolves when it returns or the user closes it. */
  openBrowser(url: string, redirectUrl: string): Promise<{ type: string; url?: string }>
  /** Turns the authorization code into a session. */
  exchangeCode(code: string): Promise<{ error: { message: string } | null }>
}

const FAILED_TO_START = 'Не удалось начать вход. Попробуйте ещё раз.'
const FAILED_TO_FINISH = 'Не удалось завершить вход. Попробуйте ещё раз.'
const PROVIDER_REFUSED = 'Провайдер не подтвердил вход.'

export function createProviderSignIn(deps: ProviderSignInDeps) {
  return async function signInWithProvider(provider: ProviderId): Promise<ProviderOutcome> {
    const started = await deps.authorize(provider, PROVIDER_RETURN_URL)
    if (started.error || !started.url) return { kind: 'failed', message: FAILED_TO_START }

    const returned = await deps.openBrowser(started.url, PROVIDER_RETURN_URL)
    // Anything but a returned address means the browser closed without an answer.
    if (returned.type !== 'success' || !returned.url) return { kind: 'cancelled' }

    const parsed = parseProviderReturn(returned.url)
    // A null here is an address that is not ours: never exchange what it carries.
    if (!parsed) return { kind: 'failed', message: FAILED_TO_FINISH }
    if (parsed.kind === 'error') return { kind: 'failed', message: PROVIDER_REFUSED }

    const exchanged = await deps.exchangeCode(parsed.code)
    if (exchanged.error) return { kind: 'failed', message: FAILED_TO_FINISH }

    return { kind: 'session' }
  }
}
```

- [ ] **Шаг 4: Убедиться, что тесты проходят**

Запустить: `npm run test --workspace @lapka/mobile`
Ожидание: PASS, шесть новых тестов.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/mobile/src/lib/provider-sign-in.ts apps/mobile/src/lib/provider-sign-in.test.ts
git commit -m "Decide what a provider sign-in returns before it touches a browser."
```

---

### Задача 3. Подключение к Supabase и системному браузеру

**Файлы:**
- Изменить: `apps/mobile/package.json` (зависимость), `apps/mobile/src/providers/AuthProvider.tsx`
- Тестов нет: это склейка с нативным модулем; поведение уже покрыто задачей 2.

**Интерфейсы:**
- Использует из задачи 2: `createProviderSignIn`, `ProviderId`, `ProviderOutcome`.
- Отдаёт: `useAuth().signInWithProvider(provider: ProviderId): Promise<ProviderOutcome>`.

- [ ] **Шаг 1: Поставить зависимость версией под SDK**

```bash
cd apps/mobile && npx expo install expo-web-browser
```

Ожидание: в `package.json` появляется `expo-web-browser` линии 57.x; `npx expo install --check`
говорит `Dependencies are up to date`.

- [ ] **Шаг 2: Собрать зависимости входа в AuthProvider**

В `apps/mobile/src/providers/AuthProvider.tsx` добавить импорты и создание функции входа:

```tsx
import * as WebBrowser from 'expo-web-browser'
import { createProviderSignIn, type ProviderId, type ProviderOutcome } from '@/lib/provider-sign-in'

const signInWithProvider = createProviderSignIn({
  async authorize(provider, redirectUrl) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      // The app opens the browser itself: that is the only way to learn that the
      // user closed it, and PKCE needs the verifier Supabase stores on this call.
      options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
    })
    return { url: data?.url ?? null, error }
  },
  openBrowser: (url, redirectUrl) => WebBrowser.openAuthSessionAsync(url, redirectUrl),
  async exchangeCode(code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    return { error }
  },
})
```

- [ ] **Шаг 3: Выставить его через контекст**

В типе `AuthState` рядом с `signIn`:

```ts
  /** Google or Yandex ID through the system browser. Returns what happened. */
  signInWithProvider(provider: ProviderId): Promise<ProviderOutcome>
```

В объекте `value` рядом с `signIn`:

```ts
      signInWithProvider,
```

- [ ] **Шаг 4: Проверить типы и тесты**

Запустить: `npm run typecheck --workspaces --if-present && npm run test --workspace @lapka/mobile`
Ожидание: exit 0.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/mobile/package.json apps/mobile/src/providers/AuthProvider.tsx package-lock.json
git commit -m "Hand the provider sign-in a real browser and a real client."
```

---

### Задача 4. Живые кнопки и сообщения на экранах

**Файлы:**
- Изменить: `apps/mobile/src/features/auth/ProviderButtons.tsx`,
  `apps/mobile/app/sign-in.tsx`, `apps/mobile/app/sign-up.tsx`
- Тестов нет: рендер React Native проверяется вручную на симуляторе (см. задачу 5).

**Интерфейсы:**
- Использует из задачи 3: `useAuth().signInWithProvider`.
- `ProviderButtons` получает проп `onOutcome(outcome: ProviderOutcome): void`; экран решает, что
  показать. Сама кнопка ничего не знает про баннеры.

- [ ] **Шаг 1: Оживить кнопки**

В `ProviderButtons.tsx`: заменить абзац комментария «The presses do nothing yet…» на описание
реального поведения; добавить состояние и обработчик:

```tsx
export function ProviderButtons({ onOutcome }: { onOutcome: (outcome: ProviderOutcome) => void }) {
  const { signInWithProvider } = useAuth()
  const [busy, setBusy] = useState<ProviderId | null>(null)

  async function start(provider: ProviderId) {
    setBusy(provider)
    try {
      onOutcome(await signInWithProvider(provider))
    } finally {
      setBusy(null)
    }
  }
  …
}
```

Импорты, которые для этого нужны: `useState` из `react`, `ActivityIndicator` из `react-native`,
`useAuth` из `@/providers/AuthProvider`, `ProviderId` и `ProviderOutcome` из
`@/lib/provider-sign-in`.

Кнопки получают исход и состояние:

```tsx
        <ProviderButton
          label="Войти с Яндекс ID"
          colours={provider.yandex}
          icon={<SvgXml xml={YANDEX_ID_SVG} width={24} height={24} />}
          loading={busy === 'custom:yandex'}
          disabled={busy !== null}
          onPress={() => start('custom:yandex')}
        />
```

Google — тем же набором пропов с `busy === 'google'` и `start('google')`.

Сам `ProviderButton` перестаёт врать про доступность:

```tsx
function ProviderButton({
  label,
  colours,
  icon,
  face,
  loading,
  disabled,
  onPress,
}: {
  label: string
  colours: { background: string; border: string; text: string }
  icon: React.ReactNode
  face?: string
  loading: boolean
  disabled: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colours.background, borderColor: colours.border },
        { opacity: pressed || disabled ? 0.9 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={colours.text} /> : icon}
      <Text style={[type.provider, { color: colours.text }, face ? { fontFamily: face } : null]}>
        {label}
      </Text>
    </Pressable>
  )
}
```

- [ ] **Шаг 2: Показать исход на экране входа**

В `apps/mobile/app/sign-in.tsx` завести состояние сообщения и передать обработчик:

```tsx
const [providerNotice, setProviderNotice] = useState<ProviderNotice | null>(null)
```

Решение о тексте и тоне живёт в `src/features/auth/provider-notice.ts` — оно одно на два экрана и
покрыто тестом: успех и отмена не говорят ничего, сбой отдаётся тоном `error`.

Баннер рисуется там же, где уже рисуется ошибка входа:

```tsx
{providerNotice ? <Banner text={providerNotice.text} tone={providerNotice.tone} /> : null}
…
<ProviderButtons onOutcome={handleProviderOutcome} />
```

- [ ] **Шаг 3: То же на экране регистрации**

В `apps/mobile/app/sign-up.tsx` повторить шаг 2 — там уже есть `Banner` и `ProviderButtons`.
Поведение то же: молчание при отмене, баннер при сбое.

- [ ] **Шаг 4: Проверить типы, тесты и сборку бандлов**

Запустить:
`npm run typecheck --workspaces --if-present && npm run test --workspace @lapka/mobile && npm run export:ios --workspace @lapka/mobile`
Ожидание: exit 0 у всех трёх.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/mobile/src/features/auth/ProviderButtons.tsx apps/mobile/app/sign-in.tsx apps/mobile/app/sign-up.tsx
git commit -m "Let the two provider buttons do what they promise."
```

---

### Задача 5. Живая проверка на симуляторе и отчёт

**Файлы:**
- Создать: `docs/verification/stage-5.md`, `docs/verification/runs/stage-5/<UTC>.md`
- Изменить: `docs/verification/OPEN_QUESTIONS.md`, `docs/mobile-api-plan.md` (чекбокс 5/01 —
  только если приёмка действительно закрыта)

- [ ] **Шаг 1: Собрать и запустить приложение на симуляторе**

```bash
npm run ios --workspace @lapka/mobile
```

Ожидание: сборка проходит, приложение открывается на iPhone 17 Pro (iOS 26.5).
Если сборка требует CocoaPods и их нет — это блокирующая находка, её записывают в отчёт, а не
обходят молча.

- [ ] **Шаг 2: Пройти сценарии**

Учётные данные вводит владелец проекта; агент открывает экраны, снимает скриншоты и фиксирует, что
вернулось. Сценарии: вход Яндексом; вход Google; отмена на экране провайдера (ожидание — экран входа
без сообщения); повторный вход после выхода (ожидание — тот же пользователь, те же
питомцы, дубликат профиля не создаётся).

- [ ] **Шаг 3: Сверить, кому принадлежит сессия**

В панели Supabase `Authentication → Users` убедиться, что появился пользователь с ожидаемым
провайдером и адресом, а не второй профиль на тот же адрес.

Если вход Яндексом падает именно на получении профиля, причина известна заранее: у `custom:yandex`
пустой `attribute_mapping`, а Яндекс отдаёт `id` и `default_email` вместо `sub` и `email`. Чинится
настройкой провайдера в Supabase, а не кодом приложения; факт и способ починки записываются в отчёт.

- [ ] **Шаг 4: Записать отчёт**

`docs/verification/stage-5.md` по шаблону `docs/verification/REPORT_TEMPLATE.md`: матрица 5/01 с
фактическими результатами, iOS — PARTIAL (симулятор, не устройство), Android — NOT RUN.
В `OPEN_QUESTIONS.md` — обязательный долг: проверить Android, где разделение путей возврата решает
реальную гонку, а на iOS её не видно.

- [ ] **Шаг 5: Коммит**

```bash
git add docs/verification docs/mobile-api-plan.md
git commit -m "Report what the simulator could and could not prove about provider sign-in."
```

---

## Порядок

1 → 2 → 3 → 4 → 5. Задачи 1 и 2 самодостаточны и проверяются тестами; 3 и 4 без симулятора
проверяются только типами и сборкой; 5 — единственная, где нужен человек.
