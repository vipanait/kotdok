import { plural } from '@/lib/plural'
import { PAIN_SIGNS, PET_DIETS, PET_LIFESTYLES, PET_SIZE_CLASSES, PET_WALK_ACTIVITIES } from '@lapka/contracts'

/**
 * Russian, and the shape every other language must match.
 *
 * The type of the dictionary is taken from this file, so a language that
 * forgets a key does not compile. Wording here is the design concept's, which
 * is the authority for Russian.
 */
export const ru = {
  common: {
    cancel: 'Отмена',
    save: 'Сохранить',
    retry: 'Повторить',
    back: 'Назад',
    next: 'Далее',
    toPets: 'К питомцам',
    toList: 'К списку',
    notStated: 'Не указано',
    offline: 'Нет связи с сервером',
  },

  auth: {
    tagline: 'Маленькие лапки. Большая забота',
    signInTitle: 'Вход',
    signUpTitle: 'Регистрация',
    recoverTitle: 'Восстановление пароля',
    newPasswordTitle: 'Новый пароль',
    email: 'Почта',
    emailPlaceholder: 'anna@example.com',
    password: 'Пароль',
    newPassword: 'Новый пароль',
    showPassword: 'Показать пароль',
    hidePassword: 'Скрыть пароль',
    signIn: 'Войти',
    signUp: 'Зарегистрироваться',
    sendLink: 'Отправить ссылку',
    createAccount: 'Создать аккаунт',
    forgotPassword: 'Забыли пароль?',
    haveAccount: 'Уже есть аккаунт',
    backToSignIn: 'Назад ко входу',
    confirmSent: 'Отправили письмо. Откройте ссылку из него, чтобы подтвердить почту.',
    resetSent: 'Если такая почта зарегистрирована, письмо отправлено.',
    dividerProviders: 'или войти с помощью',
    yandex: 'Войти с Яндекс ID',
    google: 'Продолжить с Google',
    linkExpired: 'Ссылка больше не действует.',
  },

  pets: {
    title: 'Питомцы',
    add: 'Добавить питомца',
    newTitle: 'Новый питомец',
    fallbackTitle: 'Питомец',
    emptyTitle: 'Здесь будут ваши питомцы',
    emptyBody: 'Пока никого нет. Добавьте первого.',
    checkSymptoms: 'Проверить симптомы',
    history: 'История проверок',
    remove: 'Удалить питомца',
    removeTitle: 'Удалить питомца?',
    removeBody: 'Вместе с ним исчезнет история его проверок. Отменить это будет нельзя.',
    removeConfirm: 'Удалить',
  },

  petForm: {
    species: 'Вид',
    name: 'Имя *',
    breed: 'Порода',
    age: (max: number) => `Возраст (лет), до ${max}`,
    weight: (max: number) => `Вес (кг), до ${max}`,
    sex: 'Пол',
    health: 'Здоровье',
    lifestyle: 'Образ жизни',
    notes: 'Заметки',
    neutered: 'Стерилизован(а)/кастрирован(а)',
    vaccinated: 'Вакцинация',
    vaccinatedYes: 'Привит(а)',
    yes: 'Да',
    no: 'Нет',
    allergies: 'Аллергии',
    allergiesHint: 'курица, рыба — через запятую',
    chronic: 'Хронические болезни',
    medications: 'Принимает препараты',
    keeping: 'Содержание',
    diet: 'Питание',
    size: 'Размер',
    walk: 'Выгул',
    filledOf: (filled: number, total: number) => `${filled} из ${total}`,
  },

  check: {
    title: 'Проверка симптомов',
    step: (current: number, of: number) => `Шаг ${current} из ${of}`,
    pet: 'Питомец',
    noPet: 'Без питомца',
    symptoms: 'Что происходит *',
    symptomsPlaceholder: 'Вялый второй день, ест мало, прячется',
    symptomsHint: 'Пишите как есть, своими словами. Чем подробнее — тем точнее ответ.',
    optionalHint: 'Всё необязательно, но каждый ответ уточняет результат.',
    change: 'Изменить',
    submit: 'Проверить',
    appetite: 'Аппетит',
    activity: 'Активность',
    duration: 'Симптомы длятся',
    stool: 'Стул',
    painSigns: 'Признаки боли',
    needPetTitle: 'Сначала добавьте питомца',
    needPetBody:
      'Ответ опирается на вид, возраст и хронические болезни. Без них проверка получится общей, а списана будет как обычная.',
    waitingTitle: 'Смотрим симптомы',
    waitingBody: 'Это занимает до минуты. Не закрывайте экран.',
    requestCheck: 'Запросить проверку',
    openHistory: 'Открыть историю',
    tryAgain: 'Попробовать ещё раз',
  },

  result: {
    fallbackTitle: 'Проверка',
    causes: 'Возможные причины',
    homeCare: 'Что можно сделать дома',
    vetQuestions: 'О чём спросить врача',
    copy: 'Скопировать',
    copied: 'Скопировано',
    youDescribed: 'Что вы описали',
    disclaimer: 'Это не диагноз. Решение о лечении принимает только ветеринарный врач.',
  },

  history: {
    title: 'История',
    emptyTitle: 'Проверок пока не было',
    emptyBody: 'Здесь появятся результаты, когда вы проверите симптомы',
  },

  profile: {
    title: 'Профиль',
    checksLeft: (count: number) => `${plural(count, 'проверка', 'проверки', 'проверок')} осталось`,
    language: 'Язык',
    history: 'История проверок',
    signOut: 'Выйти',
    version: (value: string) => `Версия ${value}`,
    localeSaved: 'Язык сохранён. Ответы анализа придут на нём.',
    extraTitle: 'Дополнительная проверка',
    extraRequest: 'Запросить дополнительную проверку',
    extraBody:
      'Расскажем, что случилось, и добавим одну проверку. Обычно отвечаем в течение дня.',
    extraSend: 'Отправить запрос',
    extraPending: 'Запрос отправлен. Ответим в течение дня.',
    extraApproved: 'Проверка добавлена на баланс.',
    extraRejected: 'В этот раз не получилось.',
  },

  notFound: {
    title: 'Страница не найдена',
    body: 'Ссылка не открывается. Возможно, она устарела или потерялась по дороге.',
    home: 'На главную',
  },

  errors: {
    invalidCredentials: 'Неверная почта или пароль',
    emailNotConfirmed: 'Почта ещё не подтверждена. Откройте ссылку из письма',
    emailInvalid: 'Проверьте адрес почты',
    emailTaken: 'Такая почта уже зарегистрирована',
    weakPassword: 'Пароль слишком простой — сделайте его длиннее',
    samePassword: 'Это тот же пароль. Придумайте новый',
    tooManyEmails: 'Слишком много писем подряд. Попробуйте через минуту',
    tooManyAttempts: 'Слишком много попыток. Попробуйте через минуту',
    fillBoth: 'Заполните оба поля',
    noSuchAccount: 'Такой учётной записи нет',
    sessionExpired: 'Сессия истекла. Войдите ещё раз',
    signUpClosed: 'Регистрация сейчас закрыта',
    noAnswer: 'Сервер не ответил. Попробуйте ещё раз',
    badRequest: 'Проверьте заполненные поля',
    unauthorized: 'Нужно войти заново',
    forbidden: 'Нет доступа',
    notFound: 'Не найдено',
    conflict: 'Это уже было сделано',
    insufficientCredits: 'Не хватает проверок на балансе',
    payloadTooLarge: 'Слишком много данных',
    unsupportedMedia: 'Неподдерживаемый формат',
    rateLimited: 'Слишком часто. Подождите немного',
    accountDeleting: 'Учётная запись удаляется',
    reauthRequired: 'Подтвердите, что это вы: войдите заново',
    dependencyUnavailable: 'Сервис временно недоступен',
    internal: 'Что-то пошло не так на нашей стороне',
    signInFailed: 'Не удалось войти',
    signUpFailed: 'Не удалось зарегистрироваться',
    sendFailed: 'Не удалось отправить письмо',
    savePasswordFailed: 'Не удалось сохранить пароль',
    loadPetsFailed: 'Не удалось загрузить питомцев',
    loadPetFailed: 'Не удалось загрузить питомца',
    savePetFailed: 'Не удалось сохранить питомца',
    saveChangesFailed: 'Не удалось сохранить изменения',
    removePetFailed: 'Не удалось удалить питомца',
    loadProfileFailed: 'Не удалось загрузить профиль',
    loadHistoryFailed: 'Не удалось загрузить историю',
    changeLocaleFailed: 'Не удалось сменить язык',
    submitCheckFailed: 'Не удалось отправить проверку',
    loadRequestFailed: 'Не удалось загрузить состояние запроса',
    sendRequestFailed: 'Не удалось отправить запрос',
    analysisFailed: 'Анализ не удался. Попробуйте ещё раз',
    analysisSlow: 'Анализ занимает дольше обычного. Загляните в историю позже',
  },

  validation: {
    symptomsMin: (min: number) => `Опишите симптомы — хотя бы ${min} символа`,
    symptomsMax: (max: number) => `Слишком длинное описание, предел ${max} символов`,
    petRequired: 'Выберите питомца — без него проверку не сделать',
    nameRequired: 'Введите имя питомца',
    ageRange: (max: number) => `Возраст — число от 0 до ${max}`,
    weightRange: (max: number) => `Вес — число от 0 до ${max}`,
  },

  provider: {
    failedToStart: 'Не удалось начать вход. Попробуйте ещё раз.',
    failedToFinish: 'Не удалось завершить вход. Попробуйте ещё раз.',
    refused: 'Провайдер не подтвердил вход.',
  },

  session: {
    notSaved: 'Не удалось сохранить вход на этом устройстве. Войдите ещё раз.',
    expired: 'Сессия истекла. Войдите ещё раз.',
  },

  tabs: { pets: 'Питомцы', check: 'Проверка', profile: 'Профиль' },

  urgency: {
    emergency: { label: 'ЭКСТРЕННО', action: 'Немедленно в ветеринарную клинику' },
    urgent: { label: 'СРОЧНО', action: 'К ветеринару в течение 24 часов' },
    monitor: { label: 'НАБЛЮДАЕМ', action: 'Наблюдайте 48 часов, при ухудшении — к врачу' },
    home_care: { label: 'ДОМАШНИЙ УХОД', action: 'Можно лечить дома' },
    healthy: { label: 'ВСЁ В ПОРЯДКЕ', action: 'Ничего делать не нужно' },
  },

  petAge: (years: number) => `${years} ${plural(years, 'год', 'года', 'лет')}`,

  species: { cat: 'Кот', dog: 'Собака' },
  sexCat: { male: 'Кот', female: 'Кошка' },
  sexDog: { male: 'Кобель', female: 'Сука' },

  lifestyle: { indoor: 'Домашний', outdoor: 'Уличный', both: 'Смешанный' },
  diet: { dry: 'Сухой корм', wet: 'Влажный', mixed: 'Смешанное', raw: 'Натуральное' },
  size: {
    toy: 'Миниатюрный',
    small: 'Маленький',
    medium: 'Средний',
    large: 'Крупный',
    giant: 'Гигантский',
  },
  walk: {
    rare: 'Редко',
    daily_short: 'Ежедневно коротко',
    daily_long: 'Ежедневно долго',
    sport: 'Спорт / активные нагрузки',
  },
  appetite: { normal: 'Ест нормально', reduced: 'Ест меньше', none: 'Не ест' },
  activity: { normal: 'Бодрый', low: 'Менее активный', lethargic: 'Вялый' },
  duration: { today: 'Сегодня', '2-3days': '2–3 дня', 'week+': 'Больше недели' },
  stool: {
    normal: 'Нормальный',
    loose: 'Жидкий (понос)',
    absent: 'Отсутствует',
    bloody: 'С кровью',
  },
  pain: {
    tense: 'Напряжён / скован',
    hunched: 'Сгорбленная поза',
    grimace: 'Прищур / гримаса',
    touch_sensitive: 'Болезненно на касание',
    hiding: 'Прячется больше обычного',
    vocalizing: 'Жалобные звуки',
  },

  placeholders: {
    cat: {
      name: 'Мурка',
      breed: 'Сибирская',
      chronic: 'ХБП, сахарный диабет — через запятую',
      medications: 'Нефростоп, витамины — через запятую',
    },
    dog: {
      name: 'Бобик',
      breed: 'Лабрадор',
      chronic: 'Дисплазия, атопия — через запятую',
      medications: 'Апоквел, витамины — через запятую',
    },
  },
}

/**
 * The shape every language must fill.
 *
 * Taken from the Russian file rather than declared separately: two places to
 * keep in step is one too many, and a language that forgets a key should fail
 * to compile rather than leave a blank on someone's screen.
 *
 * Deliberately without `as const` — literal types here would mean English
 * could only ever be assigned the Russian words.
 */
export type Dictionary = typeof ru

// Every option the contract allows must have a word, or it renders as nothing.
const _exhaustive: [
  Record<(typeof PET_LIFESTYLES)[number], string>,
  Record<(typeof PET_DIETS)[number], string>,
  Record<(typeof PET_SIZE_CLASSES)[number], string>,
  Record<(typeof PET_WALK_ACTIVITIES)[number], string>,
  Record<(typeof PAIN_SIGNS)[number], string>,
] = [ru.lifestyle, ru.diet, ru.size, ru.walk, ru.pain]
void _exhaustive
