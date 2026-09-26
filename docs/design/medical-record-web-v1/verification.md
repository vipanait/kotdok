# Проверка дизайн-пакета · 26 сентября 2026

Текущий набор: 71 экранов × 4 ширины = 284 проверок на 320/390/1024/1440 px. Источник: render-report.json, команда `node docs/design/medical-record-web-v1/render.cjs`.

- Ошибки JavaScript: 0.
- Переполнение, незагруженные изображения или фрагментированные карточки: 0.
- Базовые действия: passed.
- Сохранённые записи: completed records immutable; plan edit/cancel passed.
- Аудит форм: medicine toggles and rows; individual weights; fresh creation; product interval; planning preserves positions: passed.
- Скриншоты: три PNG на состояние (desktop, mobile viewport, mobile full). Из галереи и экспорта удалены формы изменения выполненных процедур.

Исправление карточки истории: `a.card` явно блочный элемент. Повторная проверка включает `fragmentedCards`.

Эта проверка относится к локальному прототипу. Реальное API, авторизация, серверный запрет редактирования выполненного, Safari/iOS, доступность и печать длинных реальных данных принимаются отдельно по MW-01…08. [Изменения и ограничения форм](form-audit.md).
