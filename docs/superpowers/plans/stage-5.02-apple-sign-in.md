# Исполнимый план 5/02–5/05 — вход через Apple на iOS, Android и сайте

> **Для агентов:** реализовывать по одной задаче через `superpowers:subagent-driven-development`
> либо `superpowers:executing-plans`. Шаги отмечаются чекбоксами.

**Цель:** один Apple-аккаунт входит в Лапку на iPhone (нативное окно Apple), на Android и на сайте
(системный браузер) и во всех трёх случаях попадает к одному и тому же пользователю Supabase.

**Подход:** на iOS `expo-apple-authentication` отдаёт identity token, выписанный с хэшем nonce, а
`supabase.auth.signInWithIdToken` проверяет его и выдаёт сессию. Логика отделена от нативных
модулей фабрикой с зависимостями, как `createProviderSignIn`, и тестируется в node. Android и сайт
используют уже работающий браузерный вход с `provider: 'apple'`. Подделку подписи проверяет
интеграционный тест на локальном Supabase, nonce и audience проверяются вручную на iPhone.

**Стек:** Expo SDK 57, React Native 0.86, `expo-apple-authentication` ~57.0.2, `expo-crypto`,
`@supabase/supabase-js` 2.103, Next.js (клиентский компонент без новых API), vitest 4, Supabase CLI.

**Спека:** [2026-09-14-stage-5-02-apple-sign-in-design.md](../specs/2026-09-14-stage-5-02-apple-sign-in-design.md)

## Общие ограничения

- Ветка `mobile/stage-5-apple-sign-in`. Коммиты по-английски, одним предложением в стиле истории
  репозитория, с последней строкой `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Идентификаторы ровно такие: команда `5KT7H5RVKF`, Bundle ID `my.lapka.app`, Services ID
  `my.lapka.web`, провайдер Supabase `apple`. Client IDs всегда в порядке `my.lapka.web,my.lapka.app`.
- Файл ключа `.p8` и client secret не попадают ни в репозиторий, ни в документы, ни в чат, ни в логи.
  Токены, nonce и authorization code тоже не пишутся в лог ни в каком виде.
- У Apple запрашивается только `EMAIL`. Имя не запрашивается и не читается.
- Исходы входа — существующий `ProviderOutcome` и существующие тексты `t.provider`. Отмена молчит,
  сбой — `Banner` с тоном `error`.
- Подпись кнопки Apple только из вариантов Apple: `Продолжить с Apple` / `Continue with Apple`,
  одинаково на входе и регистрации. Дословный русский текст подтверждается по системной кнопке на
  iPhone в задаче 8.
- Порядок кнопок: на iOS Apple, Яндекс ID, Google; на Android и сайте Яндекс ID, Google, Apple.
- Логотип Apple только из Apple Design Resources, без перерисовки и перекраски. Скачивание файла —
  с явного разрешения владельца проекта.
- `apps/mobile/ios/` в git не хранится. Команда и entitlement задаются только в `app.json`.
- Мобильный код не импортирует Next.js и серверные SDK; `packages/*` не трогаем.
- Внешние провайдеры в автотестах не вызываются. Исключение одно: интеграционный тест читает
  публичные ключи Apple, чтобы его отказ был про подпись, а не про сеть.
- В `apps/web` новых API Next.js не используем. Если задача всё же потребует роутинг или серверный
  код, сначала прочитать соответствующий раздел `node_modules/next/dist/docs/`.

---

### Задача 1. Логика нативного входа Apple

**Файлы:**
- Создать: `apps/mobile/src/lib/apple-sign-in.ts`
- Тесты: `apps/mobile/src/lib/apple-sign-in.test.ts`

**Интерфейсы:**
- Берёт: `ProviderMessages`, `ProviderOutcome` из `apps/mobile/src/lib/provider-sign-in.ts`.
- Отдаёт:
  - `type AppleSignInDeps = { randomNonce(): string; sha256(value: string): Promise<string>; requestCredential(hashedNonce: string): Promise<{ identityToken: string | null }>; signInWithIdToken(token: string, nonce: string): Promise<{ error: { message: string } | null }>; reportFailure?(stage: 'apple' | 'supabase', detail: string): void }`
  - `createAppleSignIn(deps: AppleSignInDeps): (messages: ProviderMessages) => Promise<ProviderOutcome>`
  - `usesNativeAppleSignIn(os: string): boolean` — `true` только для `'ios'`.

- [ ] **Шаг 1: Написать падающие тесты**

Создать `apps/mobile/src/lib/apple-sign-in.test.ts`:

```ts
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createAppleSignIn, usesNativeAppleSignIn, type AppleSignInDeps } from './apple-sign-in'
import { ru } from '@/i18n/ru'

const messages = ru.provider
const TOKEN = 'header.payload.signature'

const sha256 = async (value: string) => createHash('sha256').update(value).digest('hex')

/** What expo-apple-authentication rejects with: an Error carrying a string code. */
function nativeError(code: string) {
  return Object.assign(new Error(code), { code })
}

/** The happy path, with the pieces a test wants to replace passed in. */
function deps(overrides: Partial<AppleSignInDeps> = {}): AppleSignInDeps {
  let issued = 0
  return {
    randomNonce: vi.fn(() => `nonce-${++issued}`),
    sha256: vi.fn(sha256),
    requestCredential: vi.fn(async () => ({ identityToken: TOKEN })),
    signInWithIdToken: vi.fn(async () => ({ error: null })),
    reportFailure: vi.fn(),
    ...overrides,
  }
}

describe('signing in with Apple on the device', () => {
  it('hands the token and the raw nonce to Supabase', async () => {
    const d = deps()

    await expect(createAppleSignIn(d)(messages)).resolves.toEqual({ kind: 'session' })
    expect(d.signInWithIdToken).toHaveBeenCalledWith(TOKEN, 'nonce-1')
  })

  it('gives Apple the hash of the nonce, never the nonce itself', async () => {
    const d = deps()

    await createAppleSignIn(d)(messages)

    expect(d.requestCredential).toHaveBeenCalledWith(await sha256('nonce-1'))
    expect(d.requestCredential).not.toHaveBeenCalledWith('nonce-1')
  })

  it('makes a new nonce for every attempt', async () => {
    const d = deps()
    const signIn = createAppleSignIn(d)

    await signIn(messages)
    await signIn(messages)

    expect(d.requestCredential).toHaveBeenNthCalledWith(1, await sha256('nonce-1'))
    expect(d.requestCredential).toHaveBeenNthCalledWith(2, await sha256('nonce-2'))
    expect(d.signInWithIdToken).toHaveBeenNthCalledWith(2, TOKEN, 'nonce-2')
  })

  it('treats a closed sheet as a cancellation and never reaches Supabase', async () => {
    const d = deps({
      requestCredential: vi.fn(async () => {
        throw nativeError('ERR_REQUEST_CANCELED')
      }),
    })

    await expect(createAppleSignIn(d)(messages)).resolves.toEqual({ kind: 'cancelled' })
    expect(d.signInWithIdToken).not.toHaveBeenCalled()
    expect(d.reportFailure).not.toHaveBeenCalled()
  })

  it('fails to start on any other Apple error, and reports its code', async () => {
    const d = deps({
      requestCredential: vi.fn(async () => {
        throw nativeError('ERR_REQUEST_FAILED')
      }),
    })

    await expect(createAppleSignIn(d)(messages)).resolves.toEqual({
      kind: 'failed',
      message: messages.failedToStart,
    })
    expect(d.signInWithIdToken).not.toHaveBeenCalled()
    expect(d.reportFailure).toHaveBeenCalledWith('apple', 'ERR_REQUEST_FAILED')
  })

  it('fails to start on an error that carries no code', async () => {
    const d = deps({
      requestCredential: vi.fn(async () => {
        throw new Error('boom')
      }),
    })

    expect((await createAppleSignIn(d)(messages)).kind).toBe('failed')
    expect(d.reportFailure).toHaveBeenCalledWith('apple', 'unknown')
  })

  it('fails to finish when Apple returns no token, without asking Supabase', async () => {
    const d = deps({ requestCredential: vi.fn(async () => ({ identityToken: null })) })

    await expect(createAppleSignIn(d)(messages)).resolves.toEqual({
      kind: 'failed',
      message: messages.failedToFinish,
    })
    expect(d.signInWithIdToken).not.toHaveBeenCalled()
  })

  it('fails to finish when Supabase refuses the token, and tries exactly once', async () => {
    const d = deps({
      signInWithIdToken: vi.fn(async () => ({ error: { message: 'Nonces mismatch' } })),
    })

    await expect(createAppleSignIn(d)(messages)).resolves.toEqual({
      kind: 'failed',
      message: messages.failedToFinish,
    })
    expect(d.signInWithIdToken).toHaveBeenCalledTimes(1)
    expect(d.reportFailure).toHaveBeenCalledWith('supabase', 'Nonces mismatch')
  })

  it('never puts the token or the nonce into a report', async () => {
    const reports: string[] = []
    const reportFailure = (stage: string, detail: string) => reports.push(`${stage} ${detail}`)

    await createAppleSignIn(
      deps({ reportFailure, requestCredential: vi.fn(async () => { throw nativeError('ERR_INVALID_RESPONSE') }) }),
    )(messages)
    await createAppleSignIn(
      deps({ reportFailure, requestCredential: vi.fn(async () => ({ identityToken: null })) }),
    )(messages)
    await createAppleSignIn(
      deps({ reportFailure, signInWithIdToken: vi.fn(async () => ({ error: { message: 'Bad ID token' } })) }),
    )(messages)

    expect(reports).toHaveLength(3)
    for (const report of reports) {
      expect(report).not.toContain(TOKEN)
      expect(report).not.toContain('nonce-')
    }
  })
})

describe('which way Apple is reached', () => {
  it('uses the system sheet only on iOS', () => {
    expect(usesNativeAppleSignIn('ios')).toBe(true)
    expect(usesNativeAppleSignIn('android')).toBe(false)
    expect(usesNativeAppleSignIn('web')).toBe(false)
  })
})
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

Запустить: `npm run test --workspace @lapka/mobile -- src/lib/apple-sign-in.test.ts`
Ожидание: FAIL, `Failed to resolve import "./apple-sign-in"`.

- [ ] **Шаг 3: Написать модуль**

Создать `apps/mobile/src/lib/apple-sign-in.ts`:

```ts
/**
 * Signing in with Apple through the system sheet on iOS.
 *
 * Unlike Google and Yandex there is no browser and no code to exchange: Apple
 * hands the app an identity token, and Supabase checks it — Apple's signature,
 * the audience, the nonce, the expiry — before it issues a session. Nothing
 * here checks the token again. A check made on the client proves nothing to a
 * server that has to assume the client is lying.
 *
 * The sheet and the client arrive as dependencies, as in `provider-sign-in.ts`,
 * so every decision below is testable without a phone.
 *
 * Android and the site reach Apple through the browser flow instead; there is
 * no system sheet there.
 */

import type { ProviderMessages, ProviderOutcome } from './provider-sign-in'

/** The code the sheet rejects with when the person closes it. */
const CANCELLED = 'ERR_REQUEST_CANCELED'

export type AppleSignInDeps = {
  /** A fresh, unguessable value for this one attempt. */
  randomNonce(): string
  /** Lowercase hex SHA-256: the form Supabase compares with the token's `nonce`. */
  sha256(value: string): Promise<string>
  /**
   * Opens Apple's sheet with the hashed nonce. Resolves with the token, or
   * rejects with the native error, whose `code` tells a closed sheet apart.
   */
  requestCredential(hashedNonce: string): Promise<{ identityToken: string | null }>
  /** Hands the token and the raw nonce to Supabase, which hashes and compares. */
  signInWithIdToken(token: string, nonce: string): Promise<{ error: { message: string } | null }>
  /**
   * Somewhere for whoever is debugging to read what failed. Never given the
   * token or the nonce — only the stage and the error's own words.
   */
  reportFailure?(stage: 'apple' | 'supabase', detail: string): void
}

/** The system sheet exists only on Apple's own platforms; this app ships to iOS. */
export function usesNativeAppleSignIn(os: string): boolean {
  return os === 'ios'
}

export function createAppleSignIn(deps: AppleSignInDeps) {
  return async function signInWithApple(messages: ProviderMessages): Promise<ProviderOutcome> {
    // Apple writes the hash into the token; Supabase gets the raw value and
    // hashes it itself. A token replayed from another attempt carries a hash of
    // a nonce this attempt never made, and is refused.
    const nonce = deps.randomNonce()
    const hashedNonce = await deps.sha256(nonce)

    let identityToken: string | null
    try {
      ;({ identityToken } = await deps.requestCredential(hashedNonce))
    } catch (cause) {
      const code = errorCode(cause)
      // Closing the sheet is a choice, not a failure: nothing reaches Supabase,
      // so no account is created by a person who changed their mind.
      if (code === CANCELLED) return { kind: 'cancelled' }
      deps.reportFailure?.('apple', code ?? 'unknown')
      return { kind: 'failed', message: messages.failedToStart }
    }

    if (!identityToken) {
      deps.reportFailure?.('apple', 'no identity token')
      return { kind: 'failed', message: messages.failedToFinish }
    }

    const { error } = await deps.signInWithIdToken(identityToken, nonce)
    if (error) {
      deps.reportFailure?.('supabase', error.message)
      return { kind: 'failed', message: messages.failedToFinish }
    }

    return { kind: 'session' }
  }
}

function errorCode(cause: unknown): string | null {
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) return null
  return typeof cause.code === 'string' ? cause.code : null
}
```

- [ ] **Шаг 4: Убедиться, что тесты проходят**

Запустить: `npm run test --workspace @lapka/mobile -- src/lib/apple-sign-in.test.ts`
Ожидание: PASS, 10 тестов.

Затем: `npm run typecheck --workspace @lapka/mobile`
Ожидание: без ошибок.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/mobile/src/lib/apple-sign-in.ts apps/mobile/src/lib/apple-sign-in.test.ts
git commit -m "Sign in with Apple's sheet on iOS, and let Supabase judge the token."
```

---

### Задача 2. Apple как провайдер и порядок кнопок

**Файлы:**
- Изменить: `apps/mobile/src/lib/provider-sign-in.ts` (тип `ProviderId`, шапка файла)
- Тесты: `apps/mobile/src/lib/provider-sign-in.test.ts`
- Создать: `apps/mobile/src/features/auth/provider-order.ts`
- Тесты: `apps/mobile/src/features/auth/provider-order.test.ts`

**Интерфейсы:**
- Отдаёт: `type ProviderId = 'google' | 'custom:yandex' | 'apple'`;
  `providerOrder(os: string): ProviderId[]`.

- [ ] **Шаг 1: Написать падающие тесты**

Создать `apps/mobile/src/features/auth/provider-order.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { providerOrder } from './provider-order'

describe('the order of the sign-in buttons', () => {
  it('puts Apple first on an iPhone', () => {
    expect(providerOrder('ios')).toEqual(['apple', 'custom:yandex', 'google'])
  })

  it('puts Apple last everywhere else', () => {
    expect(providerOrder('android')).toEqual(['custom:yandex', 'google', 'apple'])
  })

  it('offers every provider exactly once on both platforms', () => {
    for (const os of ['ios', 'android']) {
      expect([...providerOrder(os)].sort()).toEqual(['apple', 'custom:yandex', 'google'])
    }
  })
})
```

В `apps/mobile/src/lib/provider-sign-in.test.ts`, внутри `describe('signing in with a provider')`,
добавить:

```ts
  it('sends Apple through the same browser flow on platforms without the sheet', async () => {
    const d = deps()

    await expect(createProviderSignIn(d)('apple', messages)).resolves.toEqual({ kind: 'session' })
    expect(d.authorize).toHaveBeenCalledWith('apple', PROVIDER_RETURN_URL)
  })
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

Запустить: `npm run test --workspace @lapka/mobile -- src/features/auth/provider-order.test.ts src/lib/provider-sign-in.test.ts`
Ожидание: `provider-order` FAIL (`Failed to resolve import`). `provider-sign-in` проходит в
рантайме, но `npm run typecheck --workspace @lapka/mobile` падает:
`Argument of type '"apple"' is not assignable to parameter of type 'ProviderId'`.

- [ ] **Шаг 3: Реализовать**

В `apps/mobile/src/lib/provider-sign-in.ts` заменить первую строку шапки
`* Signing in with Google or Yandex ID through the system browser.` на
`* Signing in with Google, Yandex ID or Apple through the system browser.`, а тип:

```ts
export type ProviderId = 'google' | 'custom:yandex' | 'apple'
```

Создать `apps/mobile/src/features/auth/provider-order.ts`:

```ts
import type { ProviderId } from '@/lib/provider-sign-in'

/**
 * The order of the sign-in buttons, which differs by platform on purpose.
 *
 * On an iPhone Apple comes first: it is one tap and Face ID, and Apple asks
 * that its button never needs scrolling to — first place keeps it above the
 * fold on the smallest screen. Elsewhere few people have an Apple Account, so
 * it goes last. The owner's decision of 14 September 2026.
 *
 * Kept free of React Native so the rule is testable in node.
 */
export function providerOrder(os: string): ProviderId[] {
  return os === 'ios' ? ['apple', 'custom:yandex', 'google'] : ['custom:yandex', 'google', 'apple']
}
```

- [ ] **Шаг 4: Убедиться, что тесты и типы проходят**

Запустить: `npm run test --workspace @lapka/mobile`
Ожидание: PASS, весь набор.

Запустить: `npm run typecheck --workspace @lapka/mobile`
Ожидание: без ошибок.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/mobile/src/lib/provider-sign-in.ts apps/mobile/src/lib/provider-sign-in.test.ts apps/mobile/src/features/auth/provider-order.ts apps/mobile/src/features/auth/provider-order.test.ts
git commit -m "Name Apple as a provider, and put it first only on an iPhone."
```

---

### Задача 3. Подключить Apple в приложении: зависимость, конфиг, AuthProvider, словари

**Файлы:**
- Изменить: `apps/mobile/package.json`, `package-lock.json` (через `expo install`)
- Изменить: `apps/mobile/app.json`
- Изменить: `apps/mobile/src/providers/AuthProvider.tsx`
- Изменить: `apps/mobile/src/i18n/ru.ts`, `apps/mobile/src/i18n/en.ts`

**Интерфейсы:**
- Берёт: `createAppleSignIn`, `usesNativeAppleSignIn` (задача 1), `ProviderId` с `'apple'` (задача 2).
- Отдаёт: `useAuth().signInWithProvider('apple')` сам выбирает путь; словарная строка `t.auth.apple`.

- [ ] **Шаг 1: Установить модуль**

```bash
cd apps/mobile && npx expo install expo-apple-authentication
```

Ожидание: в `apps/mobile/package.json` появилась зависимость `"expo-apple-authentication": "~57.0.2"`
(или новее в пределах `~57.0`), обновился корневой `package-lock.json`. Если `expo install` сам
дописал плагин в `app.json`, в шаге 2 не дублировать его.

- [ ] **Шаг 2: Конфиг приложения**

В `apps/mobile/app.json` блок `ios` и список плагинов должны стать такими:

```json
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "my.lapka.app",
      "appleTeamId": "5KT7H5RVKF",
      "usesAppleSignIn": true
    },
```

```json
    "plugins": [
      "expo-router",
      "expo-secure-store",
      "expo-font",
      "expo-web-browser",
      "expo-apple-authentication"
    ]
```

Проверка: `cd apps/mobile && npx expo config --type introspect | grep -n "applesignin\|5KT7H5RVKF"`
Ожидание: есть `com.apple.developer.applesignin` и `5KT7H5RVKF`.

- [ ] **Шаг 3: Подпись кнопки в словарях**

В `apps/mobile/src/i18n/ru.ts`, в блоке `auth`, после `google: 'Продолжить с Google',`:

```ts
    apple: 'Продолжить с Apple',
```

В `apps/mobile/src/i18n/en.ts`, в блоке `auth`, после `google: 'Continue with Google',`:

```ts
    apple: 'Continue with Apple',
```

- [ ] **Шаг 4: AuthProvider**

В `apps/mobile/src/providers/AuthProvider.tsx` добавить импорты рядом с существующими:

```ts
import { Platform } from 'react-native'
import * as AppleAuthentication from 'expo-apple-authentication'
import * as Crypto from 'expo-crypto'
import { createAppleSignIn, usesNativeAppleSignIn } from '@/lib/apple-sign-in'
```

Сразу после блока `const signInWithProvider = createProviderSignIn({ … })` добавить:

```ts
/**
 * Apple's system sheet with the real module and the real client, built once for
 * the same reasons as the browser flow above.
 */
const signInWithApple = createAppleSignIn({
  randomNonce: () => Crypto.randomUUID(),
  sha256: (value) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
  requestCredential: (hashedNonce) =>
    AppleAuthentication.signInAsync({
      // Email only. The app shows no names anywhere, and Apple asks apps not to
      // collect what they do not use.
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    }),
  async signInWithIdToken(token, nonce) {
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token, nonce })
    return { error }
  },
  reportFailure(stage, detail) {
    if (__DEV__) console.warn(`Apple sign-in failed at ${stage}: ${detail}`)
  },
})
```

В типе `AuthState` заменить комментарий над `signInWithProvider(provider: ProviderId)` на:

```ts
  /**
   * Google, Yandex ID or Apple. Apple on iOS goes through the system sheet,
   * everything else through the system browser; the screen does not need to
   * know which. Returns what happened, so the screen can tell a cancellation
   * apart from a failure instead of guessing from the absence of a session.
   */
```

В `useMemo` заменить строку `signInWithProvider: (provider) => signInWithProvider(provider, t.provider),` на:

```ts
      signInWithProvider: (provider) =>
        provider === 'apple' && usesNativeAppleSignIn(Platform.OS)
          ? signInWithApple(t.provider)
          : signInWithProvider(provider, t.provider),
```

- [ ] **Шаг 5: Проверки**

```bash
npm run typecheck --workspace @lapka/mobile
npm run test --workspace @lapka/mobile
npm run export:ios --workspace @lapka/mobile
npm run export:android --workspace @lapka/mobile
npm run verify:bundle --workspace @lapka/mobile
```

Ожидание: типы без ошибок; тесты PASS (включая `i18n.test.ts`: ключи совпадают, слова разные);
оба экспорта собираются; `verify:bundle` завершается кодом 0.

- [ ] **Шаг 6: Коммит**

```bash
git add apps/mobile/package.json package-lock.json apps/mobile/app.json apps/mobile/src/providers/AuthProvider.tsx apps/mobile/src/i18n/ru.ts apps/mobile/src/i18n/en.ts
git commit -m "Reach Apple through the sheet on iOS and the browser elsewhere, under the owner's team."
```

---

### Задача 4. Кнопка Apple в приложении

**Файлы:**
- Создать: `docs/design/mobile-concept-v1/assets/apple-logo-black.svg` (файл Apple без изменений)
- Создать: `apps/mobile/src/ui/apple-logo.ts`
- Изменить: `apps/mobile/src/ui/theme.ts` (`provider.apple`)
- Создать: `apps/mobile/src/features/auth/AppleButton.tsx`
- Изменить: `apps/mobile/src/features/auth/ProviderButtons.tsx`

**Интерфейсы:**
- Берёт: `providerOrder` (задача 2), `t.auth.apple` и `signInWithProvider('apple')` (задача 3).
- Отдаёт: `AppleButton({ label, loading, disabled, onPress })`; `APPLE_LOGO_SVG: string`,
  `APPLE_LOGO_ASPECT: number`.

Тестов компонентов в мобильном проекте нет: vitest работает в node без React Native (см.
`vitest.config.mts`). Проверка — типы, экспорт и снимок экрана на симуляторе.

- [ ] **Шаг 1: Получить логотип Apple**

Спросить у владельца разрешение на скачивание. Назвать файл: архив «Sign in with Apple» из Apple
Design Resources, источник https://developer.apple.com/design/resources/, размер — по странице
загрузки. Без разрешения не скачивать: попросить владельца скачать архив самому и положить файл.

Из архива взять **чёрный логотип для кнопки с текстом** (Left-aligned, Black) в формате **SVG** и
сохранить без единой правки как `docs/design/mobile-concept-v1/assets/apple-logo-black.svg`.
Записать точное имя файла в архиве и дату — они понадобятся в задаче 7.

- [ ] **Шаг 2: Логотип как строка**

Создать `apps/mobile/src/ui/apple-logo.ts` по образцу `yandex-id.ts`. Содержимое SVG вставить
дословно из файла шага 1. `APPLE_LOGO_ASPECT` — ширина, делённая на высоту, из `viewBox` этого
файла; например, для `viewBox="0 0 31 44"` это `31 / 44`.

```ts
/**
 * Apple's logo for a Sign in with Apple button with a title, copied without
 * redrawing from Apple Design Resources:
 * `docs/design/mobile-concept-v1/assets/apple-logo-black.svg`.
 *
 * Apple's artwork, not Lapka's: never recoloured, cropped or given extra
 * padding. The file already carries the padding that places the logo in a
 * button, so it is drawn at the full height of the button. See
 * `assets/provider-sources.md` in the concept for the source and the rules.
 */
export const APPLE_LOGO_SVG = `<!-- содержимое apple-logo-black.svg дословно -->`

/** Width over height of the file's viewBox, so the logo is never stretched. */
export const APPLE_LOGO_ASPECT = 31 / 44 // заменить на отношение из viewBox файла
```

Проверка: `grep -c "<svg" apps/mobile/src/ui/apple-logo.ts` → `1`; в файле не осталось текста
`содержимое` и `заменить`.

- [ ] **Шаг 3: Цвета кнопки**

В `apps/mobile/src/ui/theme.ts`, в объекте `provider`, после строки `yandex`:

```ts
  apple: { background: '#FFFFFF', border: '#000000', text: '#000000' },
```

- [ ] **Шаг 4: Компонент кнопки**

Создать `apps/mobile/src/features/auth/AppleButton.tsx`:

```tsx
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native'
import * as AppleAuthentication from 'expo-apple-authentication'
import { SvgXml } from 'react-native-svg'
import { Text } from '@/ui/Text'
import { APPLE_LOGO_ASPECT, APPLE_LOGO_SVG } from '@/ui/apple-logo'
import { TAP_TARGET, provider, radius } from '@/ui/theme'

/**
 * Sign in with Apple, drawn the way Apple requires rather than the way the
 * other buttons are.
 *
 * On iOS it is the system button: an appearance Apple has already approved,
 * a title the system translates, and a label VoiceOver reads. White with an
 * outline, because the screen is light and its neighbours are white too.
 *
 * Android has no system button, so this one keeps the system button's rules:
 * white ground, black logo and title, Apple's own logo file at the full height
 * of the button, and a title 43% of that height. That makes the title larger
 * than Google's and Yandex's. It is Apple's proportion, not a slip.
 *
 * The iOS button cannot show a spinner and must not be restyled, so while it is
 * busy the group around it shows one — see ProviderButtons.
 */
export function AppleButton({
  label,
  loading,
  disabled,
  onPress,
}: {
  label: string
  loading: boolean
  disabled: boolean
  onPress: () => void
}) {
  if (Platform.OS === 'ios') {
    return (
      <View pointerEvents={disabled ? 'none' : 'auto'} accessibilityState={{ disabled, busy: loading }}>
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE}
          cornerRadius={TAP_TARGET / 2}
          style={styles.system}
          onPress={onPress}
        />
      </View>
    )
  }

  const logoWidth = TAP_TARGET * APPLE_LOGO_ASPECT

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.custom, { opacity: pressed || disabled ? 0.9 : 1 }]}
    >
      {/* The spinner takes the logo's place, so the title does not shift. */}
      {loading ? (
        <View style={[styles.logoSlot, { width: logoWidth }]}>
          <ActivityIndicator color={provider.apple.text} />
        </View>
      ) : (
        <SvgXml xml={APPLE_LOGO_SVG} width={logoWidth} height={TAP_TARGET} />
      )}
      <Text style={styles.title}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  system: { width: '100%', height: TAP_TARGET },
  custom: {
    height: TAP_TARGET,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // Apple: at least 8% of the width between the title and the trailing edge.
    paddingRight: 24,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: provider.apple.background,
    borderColor: provider.apple.border,
  },
  logoSlot: { height: TAP_TARGET, alignItems: 'center', justifyContent: 'center' },
  // Apple: the title is 43% of the button's height, whatever the font.
  title: { fontSize: Math.round(TAP_TARGET * 0.43), color: provider.apple.text, fontWeight: '500' },
})
```

- [ ] **Шаг 5: Группа кнопок**

В `apps/mobile/src/features/auth/ProviderButtons.tsx`:

1. Импорты: к `react-native` добавить `Platform`; добавить
   `import { AppleButton } from './AppleButton'` и `import { providerOrder } from './provider-order'`.
2. Первые строки шапки заменить на `* Signing in with Apple, Yandex ID or Google.`, а абзац
   `While one provider is running the other is disabled.` — на
   `While one provider is running the others are disabled.`
3. Внутри компонента заменить весь `<View style={styles.buttons}>…</View>` на:

```tsx
      <View style={styles.buttons}>
        {providerOrder(Platform.OS).map((id) => {
          switch (id) {
            case 'apple':
              return (
                <AppleButton
                  key={id}
                  label={t.auth.apple}
                  loading={busy === 'apple'}
                  disabled={busy !== null}
                  onPress={() => start('apple')}
                />
              )
            case 'custom:yandex':
              return (
                <ProviderButton
                  key={id}
                  label={t.auth.yandex}
                  colours={provider.yandex}
                  icon={<SvgXml xml={YANDEX_ID_SVG} width={24} height={24} />}
                  loading={busy === 'custom:yandex'}
                  disabled={busy !== null}
                  onPress={() => start('custom:yandex')}
                />
              )
            case 'google':
              return (
                <ProviderButton
                  key={id}
                  label={t.auth.google}
                  colours={provider.google}
                  face={font.google}
                  icon={
                    <Image
                      source={require('../../../assets/art/google-g.png')}
                      style={styles.googleMark}
                      resizeMode="contain"
                      accessible={false}
                    />
                  }
                  loading={busy === 'google'}
                  disabled={busy !== null}
                  onPress={() => start('google')}
                />
              )
          }
        })}

        {/*
          Apple's system button can neither show a spinner nor be restyled, so
          while its token is being exchanged the whole group carries one on top.
        */}
        {busy === 'apple' && Platform.OS === 'ios' ? (
          <View style={styles.busyOverlay} accessibilityLabel={t.auth.apple} accessibilityState={{ busy: true }}>
            <ActivityIndicator color={colour.text} />
          </View>
        ) : null}
      </View>
```

4. В `styles` добавить:

```ts
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    // The screen's own cream (`colour.canvas`), see-through, so the buttons fade rather than vanish.
    backgroundColor: 'rgba(251, 246, 238, 0.7)',
  },
```

- [ ] **Шаг 6: Проверки**

```bash
npm run typecheck --workspace @lapka/mobile
npm run test --workspace @lapka/mobile
npm run export:ios --workspace @lapka/mobile
npm run export:android --workspace @lapka/mobile
npm run verify:bundle --workspace @lapka/mobile
```

Ожидание: всё зелёное, `verify:bundle` с кодом 0.

Снимок на симуляторе iOS: `cd apps/mobile && npx expo prebuild --platform ios --clean && npx expo run:ios`,
открыть экран входа и экран регистрации. Ожидание: сверху в блоке провайдеров белая кнопка Apple
с обводкой и в форме капсулы, под ней Яндекс ID и Google; кнопка видна без прокрутки на самом
маленьком доступном симуляторе iPhone. Снимки приложить к записи прогона в задаче 8.

- [ ] **Шаг 7: Коммит**

```bash
git add docs/design/mobile-concept-v1/assets/apple-logo-black.svg apps/mobile/src/ui/apple-logo.ts apps/mobile/src/ui/theme.ts apps/mobile/src/features/auth/AppleButton.tsx apps/mobile/src/features/auth/ProviderButtons.tsx
git commit -m "Draw the Apple button the way Apple requires, first on an iPhone."
```

---

### Задача 5. Apple на сайте

**Файлы:**
- Изменить: `apps/web/src/features/auth/AuthModal.tsx`
- Изменить: `apps/web/src/shared/i18n/dictionaries/ru.ts`, `apps/web/src/shared/i18n/dictionaries/en.ts`

**Интерфейсы:**
- Берёт: логотип `docs/design/mobile-concept-v1/assets/apple-logo-black.svg` (задача 4).
- Отдаёт: словарные ключи `auth.login.appleBtn`, `auth.login.errorApple`,
  `auth.register.appleBtn`, `auth.register.errorApple`.

Тестов компонентов в `apps/web/tests` нет, и под одну кнопку эта инфраструктура не заводится.
Проверка — lint, типы, сборка и ручной вход.

- [ ] **Шаг 1: Словари**

В `apps/web/src/shared/i18n/dictionaries/ru.ts`:
- в `auth.login` после `yandexBtn: 'Войти через Яндекс',` — `appleBtn: 'Продолжить с Apple',`;
  после `errorYandex: 'Не удалось войти через Яндекс',` — `errorApple: 'Не удалось войти через Apple',`;
- в `auth.register` после `yandexBtn: 'Продолжить через Яндекс',` — `appleBtn: 'Продолжить с Apple',`;
  после `errorYandex: 'Не удалось войти через Яндекс',` — `errorApple: 'Не удалось войти через Apple',`.

В `apps/web/src/shared/i18n/dictionaries/en.ts`, в тех же местах обоих блоков:
`appleBtn: 'Continue with Apple',` и `errorApple: 'Failed to sign in with Apple',`.

Подпись одна на входе и регистрации: Apple допускает только свои формулировки и просит одну и ту же
везде.

- [ ] **Шаг 2: Кнопка и логотип**

В `apps/web/src/features/auth/AuthModal.tsx` рядом с `YandexButton` добавить:

```tsx
/**
 * Sign in with Apple, in Apple's proportions rather than the other buttons':
 * white ground, black logo and title, Apple's own logo file at the full height
 * of the button, and a title 43% of that height (19px at 44px). The title is
 * therefore larger than Google's and Yandex's by Apple's rule, not by accident.
 */
function AppleButton({ onClick, loading, label }: { onClick: () => void; loading: boolean; label: string }) {
  const dict = useTranslations()
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="flex h-11 w-full items-center justify-center rounded-xl border border-black bg-white pr-6 text-[19px] font-medium text-black transition-colors hover:bg-canvas-soft disabled:opacity-50"
    >
      <AppleLogo />
      {loading ? dict.common.redirecting : label}
    </button>
  )
}
```

Рядом с `YandexIcon` добавить `AppleLogo`. Атрибут `viewBox` и все элементы внутри `<svg>`
скопировать дословно из `docs/design/mobile-concept-v1/assets/apple-logo-black.svg`, переведя
атрибуты в JSX-написание (`fill-rule` → `fillRule`, `clip-rule` → `clipRule`). Высота всегда 44:
логотип Apple рисуется на всю высоту кнопки.

```tsx
/** Apple's logo for a button with a title, from Apple Design Resources, unmodified. */
function AppleLogo() {
  return (
    <svg height="44" viewBox="0 0 31 44" aria-hidden="true">
      {/* элементы из apple-logo-black.svg дословно; viewBox — из того же файла */}
    </svg>
  )
}
```

Проверка: в `AuthModal.tsx` не осталось комментария `элементы из apple-logo-black.svg`.

- [ ] **Шаг 3: Вход (LoginPanel)**

В `LoginPanel` после `const [yandexLoading, setYandexLoading] = useState(false)`:

```tsx
  const [appleLoading, setAppleLoading] = useState(false)
```

После `handleYandex`:

```tsx
  async function handleApple() {
    setAppleLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext())}` },
    })
    if (error) { setError(t.errorApple); setAppleLoading(false) }
  }
```

В разметке, в блоке `<div className="space-y-2">`, после `<GoogleButton … />`:

```tsx
          <AppleButton onClick={handleApple} loading={appleLoading} label={t.appleBtn} />
```

- [ ] **Шаг 4: Регистрация (RegisterPanel)**

В `RegisterPanel` после `const [yandexLoading, setYandexLoading] = useState(false)`:

```tsx
  const [appleLoading, setAppleLoading] = useState(false)
```

После `handleYandex`:

```tsx
  async function handleApple() {
    if (!requireTos()) return
    setAppleLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext())}` },
    })
    if (error) { setError(t.errorApple); setAppleLoading(false) }
  }
```

В разметке, в блоке `<div className="space-y-2">`, после `<GoogleButton … />`:

```tsx
          <AppleButton onClick={handleApple} loading={appleLoading} label={t.appleBtn} />
```

- [ ] **Шаг 5: Проверки**

```bash
npm run lint --workspace @lapka/web
npm run typecheck --workspaces --if-present
npm run test --workspace @lapka/web
npm run build --workspace @lapka/web
```

Ожидание: всё без ошибок.

Ручная проверка против staging: `npm run dev:staging --workspace @lapka/web`, открыть
`http://localhost:3000/login`. Ожидание: третья кнопка «Продолжить с Apple»; нажатие уводит на
`appleid.apple.com`, в адресе `client_id=my.lapka.web`. Сам вход выполняет владелец в задаче 8.
В регистрации без галочки согласия нажатие показывает ошибку о согласии и никуда не уводит.

- [ ] **Шаг 6: Коммит**

```bash
git add apps/web/src/features/auth/AuthModal.tsx apps/web/src/shared/i18n/dictionaries/ru.ts apps/web/src/shared/i18n/dictionaries/en.ts
git commit -m "Offer Apple on the site, last in line and in Apple's proportions."
```

---

### Задача 6. Локальный Supabase и тест на поддельную подпись

**Файлы:**
- Изменить: `supabase/config.toml` (`[auth.external.apple]`)
- Создать: `apps/web/tests/integration/apple-id-token.test.ts`

**Интерфейсы:**
- Берёт: `connect` из `apps/web/tests/integration/fixtures.ts`; `TEST_SUPABASE_URL`,
  `TEST_SUPABASE_ANON_KEY` из `apps/web/.env.integration`.

Нужен запущенный Docker. Стек локальный и одноразовый; `db-guard` не пустит тесты к облачному проекту.

- [ ] **Шаг 1: Написать тест**

Создать `apps/web/tests/integration/apple-id-token.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { connect } from './fixtures'

const APPLE_ISSUER = 'https://appleid.apple.com'

let db: Client

beforeAll(async () => {
  db = await connect()
})

afterAll(async () => {
  await db?.end()
})

/**
 * A token shaped exactly like Apple's — issuer, audience, nonce, a verified
 * address — but signed with a key Apple never saw. Everything about it is
 * right except the one thing that makes it Apple's.
 */
function forgedAppleToken(claims: Record<string, unknown>): string {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const input = `${encode({ alg: 'ES256', kid: 'not-an-apple-key' })}.${encode(claims)}`
  const signature = sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' })
  return `${input}.${signature.toString('base64url')}`
}

async function countUsers(): Promise<number> {
  const { rows } = await db.query<{ n: number }>('select count(*)::int as n from auth.users')
  return rows[0].n
}

describe('an Apple identity token that Apple did not sign', () => {
  it('meets a stack that can read Apple’s keys', async () => {
    // Without Apple's keys a forged token is refused too, for the wrong reason.
    // This makes that case fail loudly instead of passing quietly.
    const response = await fetch(`${APPLE_ISSUER}/auth/keys`)
    expect(response.ok).toBe(true)
  })

  it('is refused before a session or a user exists', async () => {
    const nonce = randomUUID()
    const email = `forged-${randomUUID()}@example.com`
    const now = Math.floor(Date.now() / 1000)
    const token = forgedAppleToken({
      iss: APPLE_ISSUER,
      aud: 'my.lapka.app',
      sub: `forged.${randomUUID()}`,
      iat: now,
      exp: now + 600,
      email,
      email_verified: 'true',
      nonce: createHash('sha256').update(nonce).digest('hex'),
    })
    const before = await countUsers()

    const client = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await client.auth.signInWithIdToken({ provider: 'apple', token, nonce })

    expect(data.session).toBeNull()
    // Supabase's refusal of the token itself. "…is not enabled" would mean the
    // stack never got as far as looking at the signature.
    expect(error?.message).toBe('Bad ID token')
    expect(await countUsers()).toBe(before)
    const { rows } = await db.query('select 1 from auth.users where email = $1', [email])
    expect(rows).toHaveLength(0)
  })
})
```

- [ ] **Шаг 2: Убедиться, что тест падает при выключенном Apple**

```bash
supabase start
npm run test:integration --workspace @lapka/web -- tests/integration/apple-id-token.test.ts
```

Ожидание: первый тест PASS, второй FAIL на `expect(error?.message).toBe('Bad ID token')` с
фактическим `Provider (issuer "https://appleid.apple.com") is not enabled`. Это доказывает, что
тест отличает выключенного провайдера от отказа по подписи.

- [ ] **Шаг 3: Включить Apple на локальном стенде**

В `supabase/config.toml`, в блоке `[auth.external.apple]`, заменить две строки:

```toml
enabled = true
# Services ID first: the browser flow uses only the first entry. The bundle ID
# is there for the native iOS token. Neither is a secret.
client_id = "my.lapka.web,my.lapka.app"
```

Строку `secret = "env(SUPABASE_AUTH_EXTERNAL_APPLE_SECRET)"` не трогать: локально проверяется только
нативный токен, секрет нужен лишь браузерному входу.

```bash
supabase stop
supabase start
```

Ожидание: стек поднялся. Если CLI отказывается стартовать из-за незаданной
`SUPABASE_AUTH_EXTERNAL_APPLE_SECRET`, заменить строку секрета на
`secret = ""` с комментарием `# Local stack checks native tokens only; the browser flow needs a real secret and is not run here.`
и повторить `supabase stop && supabase start`.

- [ ] **Шаг 4: Убедиться, что тест проходит, и весь набор цел**

```bash
npm run test:integration --workspace @lapka/web -- tests/integration/apple-id-token.test.ts
npm run test:integration --workspace @lapka/web
```

Ожидание: оба теста файла PASS; весь интеграционный набор PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add supabase/config.toml apps/web/tests/integration/apple-id-token.test.ts
git commit -m "Prove a token Apple did not sign creates neither a session nor a user."
```

---

### Задача 7. Документы дизайна

**Файлы:**
- Изменить: `docs/design/mobile-design-spec.md` (раздел 6.2.1 и упоминания в 6.2 и 6.3)
- Изменить: `docs/design/mobile-concept-v1/assets/provider-sources.md`
- Изменить: `docs/superpowers/specs/2026-09-14-stage-5-02-apple-sign-in-design.md` (риск про сеть)

- [ ] **Шаг 1: Спецификация дизайна**

В `docs/design/mobile-design-spec.md`:
- заголовок `### 6.2.1 Вход через Яндекс ID и Google` заменить на
  `### 6.2.1 Вход через Apple, Яндекс ID и Google`;
- в разделе 6.2 фразу «и две кнопки из раздела 6.2.1» заменить на «и три кнопки из раздела 6.2.1»;
- в разделе 6.3 фразу «те же две кнопки Яндекс ID и Google (6.2.1)» заменить на
  «те же три кнопки провайдеров (6.2.1)»;
- в 6.2.1 после абзаца «Обе кнопки во всю ширину…» добавить:

```markdown
С 2026-09-14 добавлен вход через Apple:

- «Продолжить с Apple» — на iOS системная кнопка Apple: белая с обводкой, в форме капсулы, высота 44.
  На Android и сайте своя кнопка с теми же правилами: белый фон, чёрные логотип и текст, логотип
  Apple из Apple Design Resources на всю высоту кнопки.
- Размер подписи Apple — 43% высоты кнопки (19 при высоте 44). Она крупнее подписей Google и
  Яндекса; это требование Apple, не расхождение.
- Подпись только из формулировок Apple, одна и та же на входе и регистрации.
- Порядок: на iOS Apple, Яндекс ID, Google; на Android и сайте Яндекс ID, Google, Apple. Кнопка
  Apple видна без прокрутки.
- Пока на iOS обменивается токен Apple, все три кнопки заблокированы, а поверх группы показан
  спиннер: системную кнопку нельзя перерисовать.
```

- [ ] **Шаг 2: Источники знаков**

В конец раздела провайдеров в `docs/design/mobile-concept-v1/assets/provider-sources.md` (перед
последним абзацем про прототип) добавить. Имя файла из архива и дату подставить из задачи 4, шаг 1:

```markdown
## Apple

- [Официальные правила](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple).
- `apple-logo-black.svg` — чёрный логотип для кнопки с текстом из архива Sign in with Apple в
  [Apple Design Resources](https://developer.apple.com/design/resources/), файл `ИМЯ_ФАЙЛА_В_АРХИВЕ`,
  скачан ДАТА. Без перерисовки, обрезки и добавленных отступов; рисуется на всю высоту кнопки.
- iOS: системная `AppleAuthenticationButton`, стиль `WHITE_OUTLINE`, тип `CONTINUE`, скругление
  капсулой. Android и сайт: белый фон, чёрные логотип и текст, текст 43% высоты кнопки.
- Подписи только из вариантов Apple; для Лапки — «Продолжить с Apple» / «Continue with Apple».
```

Проверка: `grep -n "ИМЯ_ФАЙЛА_В_АРХИВЕ\|ДАТА" docs/design/mobile-concept-v1/assets/provider-sources.md`
ничего не находит.

- [ ] **Шаг 3: Уточнить риск в спеке**

В `docs/superpowers/specs/2026-09-14-stage-5-02-apple-sign-in-design.md` заменить предложение
`Поэтому тест проверяет и текст отказа.` на
`Поэтому тест сначала проверяет, что ключи Apple доступны, и сверяет текст отказа: «Bad ID token», а не «…is not enabled».`

- [ ] **Шаг 4: Коммит**

```bash
git add docs/design/mobile-design-spec.md docs/design/mobile-concept-v1/assets/provider-sources.md docs/superpowers/specs/2026-09-14-stage-5-02-apple-sign-in-design.md
git commit -m "Write down Apple's rules for its button, and where its logo came from."
```

---

### Задача 8. Приёмка на устройствах и отчёт

**Файлы:**
- Изменить: `docs/verification/stage-5.md`
- Создать: `docs/verification/runs/stage-5/<UTC-время прогона>.md`
- Изменить: `docs/mobile-api-plan.md` (отметки 5/02–5/05)
- Изменить при расхождениях: `apps/mobile/src/i18n/ru.ts`, `apps/web/src/shared/i18n/dictionaries/ru.ts`

Ввод Apple ID, пароль и Face ID выполняет владелец; агент готовит сборку, фиксирует, что вернулось,
и сверяет данные в Supabase. Ни один пункт не отмечается пройденным без проверки на устройстве.

- [ ] **Шаг 1: Подписанная сборка на iPhone**

```bash
cd apps/mobile && npx expo prebuild --platform ios --clean && npx expo run:ios --device
```

Ожидание: сборка подписана командой `5KT7H5RVKF` (в Xcode Signing & Capabilities видна команда и
capability Sign in with Apple). Если Xcode просит зарегистрировать устройство в команде, соглашается
владелец.

- [ ] **Шаг 2: Подпись кнопки**

Прочитать текст системной кнопки на iPhone с русским языком интерфейса. Если он отличается от
`Продолжить с Apple`, заменить значение `auth.apple` в `apps/mobile/src/i18n/ru.ts` и оба
`appleBtn` в `apps/web/src/shared/i18n/dictionaries/ru.ts` на дословный текст системы и
закоммитить отдельно: `git commit -m "Use Apple's own Russian wording on the Apple button."`

- [ ] **Шаг 3: Ручные сценарии**

Для каждого записать время, устройство, результат и `auth.users.id` из Supabase staging:

1. iOS: вход через Apple с тестовым Apple ID, показав настоящий адрес. Ожидание: экран питомцев.
2. iOS: отмена в окне Apple. Ожидание: экран входа без сообщения; новый пользователь не появился.
3. Android: тот же Apple ID через браузер. Ожидание: тот же `auth.users.id`, те же питомцы и баланс.
4. Сайт (`npm run dev:staging --workspace @lapka/web`): тот же Apple ID. Ожидание: тот же `auth.users.id`.
5. Второй тестовый Apple ID со скрытым адресом. Ожидание: отдельный пользователь с адресом
   `…@privaterelay.appleid.com`, приложение работает.
6. Apple ID, чей настоящий адрес уже зарегистрирован по почте с подтверждением. Ожидание: вход в
   существующий аккаунт, у пользователя identities `email` и `apple` (решение 1.19).
7. Отзыв доступа на appleid.apple.com → «Вход и безопасность» → «Вход с Apple» → Лапка, затем
   снова вход на iOS. Ожидание: тот же `auth.users.id`.
8. Отмена на Android и сайте. Ожидание: экран входа, пользователь не создан.

- [ ] **Шаг 4: Отказ по nonce (вручную, правка не коммитится)**

Во временной правке `apps/mobile/src/providers/AuthProvider.tsx` в `signInWithIdToken` передать
`nonce: \`${nonce}-tampered\``, пересобрать на iPhone, войти через Apple. Ожидание: баннер
«Не удалось завершить вход…», в консоли dev-сборки `Apple sign-in failed at supabase: Nonces mismatch`,
новый пользователь не создан. Откатить: `git checkout -- apps/mobile/src/providers/AuthProvider.tsx`,
убедиться, что `git status` чистый.

- [ ] **Шаг 5: Отказ по audience (вручную, с владельцем)**

Владелец в Supabase staging меняет Client IDs на `my.lapka.web` (без `my.lapka.app`). Вход на iOS.
Ожидание: баннер «Не удалось завершить вход…», в консоли
`Unacceptable audience in id_token`, пользователь не создан. Владелец возвращает
`my.lapka.web,my.lapka.app`, вход на iOS снова проходит.

- [ ] **Шаг 6: Запись прогона и отчёт**

Создать `docs/verification/runs/stage-5/<YYYYMMDD-HHMMSSZ>.md` по образцу
`docs/verification/runs/stage-5/20260909-123500Z.md`: окружение, сборка, каждый сценарий шагов 3–5
с результатом, снимки кнопок из задачи 4.

В `docs/verification/stage-5.md` добавить раздел `## Дополнение <дата>: вход через Apple` с
матрицей приёмки 5/02, 5/03, 5/04, 5/05: критерий, чем проверено, результат (PASS / PARTIAL / NOT
RUN). Отдельными строками: автотесты задачи 1, интеграционный тест задачи 6, ручные nonce и audience.
Для 5/05 указать, что пункт проверяется в форме отступления из 1.19.

- [ ] **Шаг 7: План**

В `docs/mobile-api-plan.md` отметить `[x]` только те из 5/02–5/05, у которых в отчёте PASS по всем
критериям приёмки. Для остальных оставить `[ ]` и добавить курсивную пометку `⚠️ *частично: …*`
в стиле 5/01 с указанием, чего не хватает.

- [ ] **Шаг 8: Коммит**

```bash
git add docs/verification/stage-5.md docs/verification/runs/stage-5/ docs/mobile-api-plan.md
git commit -m "Report Sign in with Apple on a real iPhone, Android and the site."
```

## Порядок

Задачи 1 → 2 → 3 → 4 идут последовательно: каждая опирается на имена предыдущей. Задача 5 зависит
только от логотипа из задачи 4, шаг 1. Задача 6 независима и может идти параллельно с 3–5.
Задача 7 — после 4 (нужны имя файла и дата). Задача 8 — последней, с владельцем и устройствами.
