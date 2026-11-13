import type { SafetyCategory, Urgency } from '@lapka/contracts'
import type { SafetyVerdictLabelKey } from '../safety/labels'

/**
 * The words of the domain both apps say the same way, kept once. Each app's
 * dictionary spreads them where its screens expect them; the sentences around
 * them stay the app's own.
 *
 * `against` reads mid-sentence («прививка от бешенства», “rabies vaccination”):
 * in English it is lowercase, and a title that starts with it capitalises its
 * first letter itself. `parasiteGroupsOf` likewise («обработка от блох»,
 * “flea treatment”), where `parasiteGroups` is the noun on its own («Блохи»).
 */
export type Vocabulary = {
  targets: Record<string, string>
  against: Record<string, string>
  parasiteGroups: Record<'fleas' | 'ticks' | 'worms', string>
  parasiteGroupsOf: Record<'fleas' | 'ticks' | 'worms', string>
  urgency: Record<Urgency, { label: string; action: string }>
  /** In the genitive where the language has one: «23 сентября». */
  months: string[]
  /** The «Можно ли» captions, the same in the app and on the site; the key comes from `verdictLabelKey`. */
  safetyVerdict: Record<SafetyVerdictLabelKey, string>
  safetyCategories: Record<SafetyCategory, string>
  /** The line under a medicine's verdict. */
  safetyMedicineLine: string
}

const ru: Vocabulary = {
  targets: {
    panleukopenia: 'Панлейкопения',
    calicivirus: 'Калицивироз',
    rhinotracheitis: 'Ринотрахеит',
    distemper: 'Чума плотоядных',
    parvovirus: 'Парвовирусный энтерит',
    adenovirus: 'Аденовироз',
    rabies: 'Бешенство',
    felv: 'Лейкоз',
    chlamydia: 'Хламидиоз',
    leptospirosis: 'Лептоспироз',
    parainfluenza: 'Парагрипп',
    bordetella: 'Кашель питомников',
    coronavirus: 'Коронавирусный энтерит',
  },
  against: {
    panleukopenia: 'от панлейкопении',
    calicivirus: 'от калицивироза',
    rhinotracheitis: 'от ринотрахеита',
    distemper: 'от чумы плотоядных',
    parvovirus: 'от парвовирусного энтерита',
    adenovirus: 'от аденовироза',
    rabies: 'от бешенства',
    felv: 'от лейкоза',
    chlamydia: 'от хламидиоза',
    leptospirosis: 'от лептоспироза',
    parainfluenza: 'от парагриппа',
    bordetella: 'от кашля питомников',
    coronavirus: 'от коронавирусного энтерита',
  },
  parasiteGroups: { fleas: 'Блохи', ticks: 'Клещи', worms: 'Глисты' },
  parasiteGroupsOf: { fleas: 'блох', ticks: 'клещей', worms: 'глистов' },
  urgency: {
    emergency: { label: 'ЭКСТРЕННО', action: 'Немедленно в ветеринарную клинику' },
    urgent: { label: 'СРОЧНО', action: 'К ветеринару в течение 24 часов' },
    monitor: { label: 'НАБЛЮДАЕМ', action: 'Наблюдайте 48 часов, при ухудшении — к врачу' },
    home_care: { label: 'ДОМАШНИЙ УХОД', action: 'Можно лечить дома' },
    healthy: { label: 'ВСЁ В ПОРЯДКЕ', action: 'Ничего делать не нужно' },
  },
  months: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  safetyVerdict: {
    can: 'Можно',
    nonToxic: 'Безопасно',
    caution: 'С осторожностью',
    lowRisk: 'Малый риск',
    cannot: 'Нельзя',
    dangerous: 'Опасно',
    noData: 'Нет данных',
  },
  safetyCategories: { food: 'Продукты', plant: 'Растения', medicine: 'Лекарства', household: 'Быт' },
  safetyMedicineLine: 'Лекарства для людей не давайте питомцу без назначения врача',
}

const en: Vocabulary = {
  targets: {
    panleukopenia: 'Panleukopenia',
    calicivirus: 'Calicivirus',
    rhinotracheitis: 'Rhinotracheitis',
    distemper: 'Distemper',
    parvovirus: 'Parvovirus',
    adenovirus: 'Adenovirus',
    rabies: 'Rabies',
    felv: 'Feline leukaemia',
    chlamydia: 'Chlamydia',
    leptospirosis: 'Leptospirosis',
    parainfluenza: 'Parainfluenza',
    bordetella: 'Kennel cough',
    coronavirus: 'Canine coronavirus',
  },
  against: {
    panleukopenia: 'panleukopenia',
    calicivirus: 'calicivirus',
    rhinotracheitis: 'rhinotracheitis',
    distemper: 'distemper',
    parvovirus: 'parvovirus',
    adenovirus: 'adenovirus',
    rabies: 'rabies',
    felv: 'feline leukaemia',
    chlamydia: 'chlamydia',
    leptospirosis: 'leptospirosis',
    parainfluenza: 'parainfluenza',
    bordetella: 'kennel cough',
    coronavirus: 'canine coronavirus',
  },
  parasiteGroups: { fleas: 'Fleas', ticks: 'Ticks', worms: 'Worms' },
  parasiteGroupsOf: { fleas: 'flea', ticks: 'tick', worms: 'worm' },
  urgency: {
    emergency: { label: 'EMERGENCY', action: 'Go to a veterinary clinic immediately' },
    urgent: { label: 'URGENT', action: 'See a vet within 24 hours' },
    monitor: { label: 'MONITOR', action: 'Watch for 48 hours; if worsening — see a vet' },
    home_care: { label: 'HOME CARE', action: 'Can be treated at home' },
    healthy: { label: 'ALL GOOD', action: 'No action needed' },
  },
  months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  safetyVerdict: {
    can: 'Safe to eat',
    nonToxic: 'Non-toxic',
    caution: 'With caution',
    lowRisk: 'Low risk',
    cannot: 'Not safe',
    dangerous: 'Dangerous',
    noData: 'No data',
  },
  safetyCategories: { food: 'Food', plant: 'Plants', medicine: 'Medicines', household: 'Household' },
  safetyMedicineLine: 'Do not give human medicines to a pet unless a vet prescribes them',
}

export const vocab = { ru, en } as const
