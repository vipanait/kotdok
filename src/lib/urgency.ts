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
