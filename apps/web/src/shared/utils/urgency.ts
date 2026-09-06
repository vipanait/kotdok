/**
 * Urgency design tokens. The `color` field carries the soft+border/text combo
 * used by the legacy result block; the new design system uses `bgClass`,
 * `textClass`, and `dotClass` separately so callers can compose:
 *  - dot — small status dot in lists
 *  - bgClass — full-bleed colored block (top of result modal)
 *  - textClass — colored heading inside that block
 */
export const URGENCY_CONFIG = {
  emergency: {
    emoji: '🔴',
    label: 'ЭКСТРЕННО',
    color: 'bg-red-100 text-red-800 border-red-200',
    action: 'Немедленно в ветеринарную клинику',
  },
  urgent: {
    emoji: '🟠',
    label: 'СРОЧНО',
    color: 'bg-orange-100 text-orange-800 border-orange-200',
    action: 'К ветеринару в течение 24 часов',
  },
  monitor: {
    emoji: '🟡',
    label: 'НАБЛЮДАЕМ',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    action: 'Наблюдайте 48 часов, при ухудшении — к врачу',
  },
  home_care: {
    emoji: '🟢',
    label: 'ДОМАШНИЙ УХОД',
    color: 'bg-green-100 text-green-800 border-green-200',
    action: 'Можно лечить дома',
  },
  healthy: {
    emoji: '💚',
    label: 'ВСЁ В ПОРЯДКЕ',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    action: 'Ничего делать не нужно',
  },
} as const

export type UrgencyKey = keyof typeof URGENCY_CONFIG

export const URGENCY_EMOJI: Record<string, string> = {
  emergency: '🔴',
  urgent: '🟠',
  monitor: '🟡',
  home_care: '🟢',
  healthy: '💚',
}

/** Background tint for the colored result-block at the top of a check modal. */
export const URGENCY_BG_CLASS: Record<UrgencyKey, string> = {
  emergency: 'bg-status-emergency-bg',
  urgent: 'bg-status-urgent-bg',
  monitor: 'bg-[#F8E9C0]',
  home_care: 'bg-status-good-bg',
  healthy: 'bg-status-good-bg',
}

/** Heading text color paired with `URGENCY_BG_CLASS`. */
export const URGENCY_TEXT_CLASS: Record<UrgencyKey, string> = {
  emergency: 'text-status-emergency-fg',
  urgent: 'text-status-urgent-fg',
  monitor: 'text-status-watch-fg',
  home_care: 'text-status-good-fg',
  healthy: 'text-status-good-fg',
}

/** Solid dot used in history list rows. */
export const URGENCY_DOT_CLASS: Record<UrgencyKey, string> = {
  emergency: 'bg-status-emergency-fg',
  urgent: 'bg-status-urgent-fg',
  monitor: 'bg-status-watch-fg',
  home_care: 'bg-status-good-fg',
  healthy: 'bg-status-good-fg',
}
