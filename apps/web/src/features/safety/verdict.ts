import type { SafetyCategory, SafetyVerdict } from '@lapka/contracts'
import { verdictLabelKey, vocab } from '@lapka/shared'

/**
 * How a verdict looks on the site: the app's caption for the category
 * («Можно» for a food, «Безопасно» for a plant) and the urgency colours the
 * app borrows for it (VerdictBadge.tsx in apps/mobile) — danger reads as an
 * emergency, caution as «watch», safe as healthy. The class names are the
 * urgency classes of tokens.css.
 */
const TONE: Record<SafetyVerdict, 'emergency' | 'monitor' | 'healthy'> = {
  danger: 'emergency',
  caution: 'monitor',
  safe: 'healthy',
}

export function verdictView(category: SafetyCategory, verdict: SafetyVerdict): { label: string; tone: string } {
  return { label: vocab.ru.safetyVerdict[verdictLabelKey(category, verdict)], tone: TONE[verdict] }
}

export const SAFETY_CATEGORY_TITLES = vocab.ru.safetyCategories
export const MEDICINE_LINE = vocab.ru.safetyMedicineLine
