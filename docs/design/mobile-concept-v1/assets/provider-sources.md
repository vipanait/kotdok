# Материалы кнопок авторизации

Проверено 8 сентября 2026. Эти знаки принадлежат провайдерам и не являются новой графикой бренда «Лапка».

## Google

- [Официальные правила](https://developers.google.com/identity/branding-guidelines).
- `google-g.png` — [официальный цветной G](https://developers.google.com/static/identity/images/g-logo.png), без перерисовки и перекраски.
- `GoogleSans.ttf` — Google Sans Medium 500, получен из [Google Fonts CSS](https://fonts.googleapis.com/css2?family=Google+Sans:wght@500&display=swap).
- Светлая кнопка: фон #FFFFFF, граница #747775, текст #1F1F1F, Google Sans Medium 14/20. Иконка 20×20; не растягивать и не тонировать. Локализованная подпись: «Продолжить с Google».

## Яндекс ID

- [Официальные правила и варианты](https://yandex.ru/dev/id/doc/ru/codes/buttons-design).
- `yandex-id.svg` — круглый знак «Я», извлечённый без изменения контуров из SVG кнопки-иконки на [официальной странице оформления](https://yandex.ru/dev/id/doc/ru/codes/buttons-design), без перерисовки.
- Для соседства с Google показана светлая дополнительная версия, подпись «Войти с Яндекс ID», высота 44. При реализации использовать вариант конструктора/SDK провайдера и его штатные отступы, шрифт и границу.

## Apple

- [Официальные правила](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple).
- `apple-logo-black.svg` — чёрный логотип для кнопки с текстом из образа Logo-Sign-in-with-Apple.dmg в
  [Apple Design Resources](https://developer.apple.com/design/resources/), файл `Sign in with Apple - Left Aligned/SVG/Logo - SIWA - Left-aligned - Black - Medium.svg`,
  скачан 14 сентября 2026. Без перерисовки, обрезки и добавленных отступов; рисуется на всю высоту кнопки.
- Приложение (iOS и Android): форма логотипа из этого файла с обрезанными полями (viewBox
  `7.75 10.5 15.4609 19`), значок высотой 20 в кнопке как у Яндекса и Google, подпись 14. Обрезка и
  размер подписи нарушают правила Apple — решение владельца от 15 сентября 2026. Сайт (с 17 сентября 2026) —
  так же: та же форма 18px в общей кнопке провайдеров.
- Подписи только из вариантов Apple; для Лапки — «Продолжить с Apple» / «Continue with Apple».

В прототипе кнопки локальные и не отправляют данные провайдерам. Для приложения использовать поддерживаемые способы входа и актуальные брендовые компоненты; этап разработки — 5 в `docs/mobile-api-plan.md`.
