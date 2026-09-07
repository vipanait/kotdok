import type { URGENCY_LEVELS } from '@lapka/contracts'
import type { IconName } from '@/ui/Icon'

export type UrgencyLevel = (typeof URGENCY_LEVELS)[number]

/**
 * Urgency said three ways: a word, an action, and a glyph.
 *
 * Colour alone would not be an answer. Someone who cannot tell the red card
 * from the amber one still has to learn whether to drive to a clinic tonight,
 * so the level always arrives as words first — the colour only agrees with it.
 *
 * Wording is the concept's, `levels` in screens.js.
 */
export const urgencyText: Record<
  UrgencyLevel,
  { label: string; action: string; icon: IconName }
> = {
  emergency: {
    label: 'ЭКСТРЕННО',
    action: 'Немедленно в ветеринарную клинику',
    icon: 'alert',
  },
  urgent: {
    label: 'СРОЧНО',
    action: 'К ветеринару в течение 24 часов',
    icon: 'alert',
  },
  monitor: {
    label: 'НАБЛЮДАЕМ',
    action: 'Наблюдайте 48 часов, при ухудшении — к врачу',
    icon: 'clock',
  },
  home_care: {
    label: 'ДОМАШНИЙ УХОД',
    action: 'Можно лечить дома',
    icon: 'home',
  },
  healthy: {
    label: 'ВСЁ В ПОРЯДКЕ',
    action: 'Ничего делать не нужно',
    icon: 'check',
  },
}
