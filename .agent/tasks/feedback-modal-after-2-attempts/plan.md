# План реализации: Модалка обратной связи после 2 попыток

TASK_ID: feedback-modal-after-2-attempts
CREATED_AT: 2026-05-10T06:32:00Z

### Контекст
В личном кабинете пользователя после успешного завершения 2-й симптом-чека нужно показывать модальное окно с предложением оставить обратную связь. Модалка содержит выбор реакции (понравилось / не понравилось), поле для текста и защиту от спама. Проект использует Next.js 16 App Router, Supabase, Tailwind CSS 4, без сторонних форм/диалог-библиотек.

### Критерии приёмки
- AC1: После 2-й успешной проверки симптомов модалка обратной связи автоматически появляется в ЛК
- AC2: Модалка предлагает выбрать «Понравилось» / «Не понравилось» (одиночный выбор)
- AC3: Есть необязательное текстовое поле «Что можно улучшить / просто фидбек»
- AC4: Отправить форму без выбора реакции нельзя (disabled кнопка)
- AC5: После успешной отправки модалка закрывается, повторно не показывается (поле `feedback_submitted_at` в `profiles`)
- AC6: Spam protection: пользователь может отправить feedback не чаще 1 раза в 24 часа (проверка на сервере)
- AC7: Счётчик попыток хранится на сервере — поле `symptom_checks_count` в `profiles`, увеличивается транзакционно
- AC8: Все тексты вынесены в i18n-словари `ru.ts` / `en.ts`
- AC9: Модалка доступна (role="dialog", aria-modal, Escape закрывает)
- AC10: При закрытии без отправки — модалка не показывается в текущей сессии (localStorage), но на следующей сессии снова предложит

### Ограничения
- Не добавлять новые npm-зависимости (formik, zod, radix) — использовать паттерн useState + fetch
- Поддержать оба языка (ru/en)
- Не ломать существующую логику чека

### Non-goals
- Аналитика / графики по фидбеку (только хранение)
- Email-нотификации при получении фидбека
- Возможность редактировать фидбек

### Архитектура

#### БД — новая миграция
```sql
-- 1. Добавить поля в profiles
ALTER TABLE profiles
  ADD COLUMN symptom_checks_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN feedback_submitted_at TIMESTAMPTZ;

-- 2. Таблица для хранения отзывов
CREATE TABLE user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  rating TEXT NOT NULL CHECK (rating IN ('liked', 'disliked')),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индекс для rate-limit проверки
CREATE INDEX user_feedback_user_created ON user_feedback(user_id, created_at DESC);
```

#### Серверные изменения

**`symptom-check-service.ts`** — после `symptom_checks` insert:
- `UPDATE profiles SET symptom_checks_count = symptom_checks_count + 1`
- Вернуть в ответ `show_feedback_prompt: boolean` (= `symptom_checks_count >= 2 AND feedback_submitted_at IS NULL`)

**Новый route handler** `src/app/(backend)/api/feedback/route.ts`:
- `POST` — получить `rating` + `comment`, `getAuthUser()`, проверить rate limit (< 1 submission за 24ч в `user_feedback`), вставить строку, обновить `profiles.feedback_submitted_at = NOW()`

#### Клиентские изменения

**`CheckForm.tsx`** — после получения успешного ответа:
- Если `data.show_feedback_prompt === true` → сохранить флаг в state (передать наверх через callback `onFeedbackPrompt`)

**`CheckModal.tsx`** — принять `showFeedbackPrompt?: boolean`, при `true` рендерить `<FeedbackModal>` поверх себя (или заменять контент)

**Новый компонент** `src/features/dashboard/FeedbackModal.tsx`:
- Overlay + dialog (паттерн из CheckModal)
- Два чипа: «👍 Понравилось» / «👎 Не понравилось»
- `<textarea>` для комментария (необязательно)
- Кнопка «Отправить» (disabled если rating не выбран)
- Кнопка × / Escape для закрытия без отправки
- При успехе — анимация «спасибо» и закрытие

#### i18n
Добавить секцию `feedback` в `ru.ts` и `en.ts`:
```ts
feedback: {
  title: 'Как вам сервис?',
  liked: 'Понравилось',
  disliked: 'Не понравилось',
  commentPlaceholder: 'Что можно улучшить?',
  submit: 'Отправить',
  skip: 'Пропустить',
  thanks: 'Спасибо за отзыв!',
}
```

### Шаги

#### Миграция БД
- [ ] 1. Создать `supabase/migrations/20260510_feedback.sql` — поля в `profiles` + таблица `user_feedback`

#### Серверная логика
- [ ] 2. В `symptom-check-service.ts`: после insert в `symptom_checks` — инкремент `profiles.symptom_checks_count`; добавить `show_feedback_prompt` в возвращаемый объект
- [ ] 3. Создать `src/app/(backend)/api/feedback/route.ts` — `POST` с rate-limit и записью в `user_feedback` + обновление `profiles.feedback_submitted_at`

#### i18n
- [ ] 4. Добавить секцию `feedback` в `src/shared/i18n/dictionaries/ru.ts`
- [ ] 5. Добавить секцию `feedback` в `src/shared/i18n/dictionaries/en.ts`

#### UI компоненты
- [ ] 6. Создать `src/features/dashboard/FeedbackModal.tsx` — полноценная модалка с чипами, textarea, кнопками, анимацией «спасибо»
- [ ] 7. Обновить `src/features/symptom-check/CheckForm.tsx` — передавать `onFeedbackPrompt` callback при `data.show_feedback_prompt`
- [ ] 8. Обновить `src/features/dashboard/CheckModal.tsx` — принять пропс и показать `FeedbackModal` когда нужно

#### Типы
- [ ] 9. Обновить `src/shared/types/index.ts` — добавить поля `symptom_checks_count`, `feedback_submitted_at` в тип `Profile`; добавить тип `FeedbackRating = 'liked' | 'disliked'`

### Тестирование
- [ ] Проверить: первый чек — модалка не появляется
- [ ] Проверить: второй чек — модалка появляется поверх CheckModal
- [ ] Проверить: закрытие × / Escape без отправки — в текущей сессии не появляется, при следующем входе — снова предложит
- [ ] Проверить: отправка без выбора реакции невозможна
- [ ] Проверить: отправка с выбором «Не понравилось» + комментарий — успешно сохраняется
- [ ] Проверить: повторная отправка в течение 24ч блокируется (429 от сервера)
- [ ] Проверить: после `feedback_submitted_at` заполнен — `show_feedback_prompt` не возвращается

### Заметки
- Счётчик `symptom_checks_count` в `profiles` — денормализация для избежания `COUNT(*)` запросов при каждом чеке
- `feedback_submitted_at` решает «показать ровно один раз» без хаков
- Rate limit в API (24ч) как второй уровень защиты от спама (первый — `feedback_submitted_at`)
- Поле `comment` в `user_feedback` — TEXT без ограничений длины, но на клиенте `maxLength={500}`
