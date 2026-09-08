import type { URGENCY_LEVELS } from '@lapka/contracts'
import type { Dictionary } from '@/i18n'
import type { IconName } from '@/ui/Icon'

export type UrgencyLevel = (typeof URGENCY_LEVELS)[number]

/**
 * The glyph each level wears. Language-independent, unlike the words.
 *
 * Urgency is said three ways: a word, an action, and this. Colour alone would
 * not be an answer — someone who cannot tell the red card from the amber one
 * still has to learn whether to drive to a clinic tonight.
 */
const ICONS: Record<UrgencyLevel, IconName> = {
  emergency: 'alert',
  urgent: 'alert',
  monitor: 'clock',
  home_care: 'home',
  healthy: 'check',
}

/**
 * @param t the words for the language the *analysis* was written in, which is
 * not always the language the reader has set now.
 */
export function urgencyText(
  t: Dictionary,
  level: UrgencyLevel,
): { label: string; action: string; icon: IconName } {
  return { ...t.urgency[level], icon: ICONS[level] }
}
