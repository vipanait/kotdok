/**
 * Russian wording for the pet fields, matching the site so the same pet does
 * not read differently in the two places.
 *
 * Sex depends on the species: Russian has separate words for a male cat and a
 * male dog, and using one for both is the kind of thing an owner notices.
 */

import type { Species } from './pet-form'

export const speciesLabels: Record<Species, string> = { cat: 'Кот', dog: 'Собака' }

export const sexLabels = (species: Species): Record<'male' | 'female', string> =>
  species === 'dog'
    ? { male: 'Кобель', female: 'Сука' }
    : { male: 'Кот', female: 'Кошка' }

export const lifestyleLabels = {
  indoor: 'Домашний',
  outdoor: 'Уличный',
  both: 'Смешанный',
} as const

export const dietLabels = {
  dry: 'Сухой корм',
  wet: 'Влажный',
  mixed: 'Смешанное',
  raw: 'Натуральное',
} as const

export const sizeLabels = {
  toy: 'Миниатюрный',
  small: 'Маленький',
  medium: 'Средний',
  large: 'Крупный',
  giant: 'Гигантский',
} as const

export const walkLabels = {
  rare: 'Редко',
  daily_short: 'Ежедневно коротко',
  daily_long: 'Ежедневно долго',
  sport: 'Спорт / активные нагрузки',
} as const

/** Placeholders differ by species on the site; keeping that costs one lookup. */
export const placeholders = (species: Species) =>
  species === 'dog'
    ? {
        name: 'Бобик',
        breed: 'Лабрадор',
        chronic: 'Дисплазия, атопия — через запятую',
        medications: 'Апоквел, витамины — через запятую',
      }
    : {
        name: 'Мурка',
        breed: 'Сибирская',
        chronic: 'ХБП, сахарный диабет — через запятую',
        medications: 'Нефростоп, витамины — через запятую',
      }
