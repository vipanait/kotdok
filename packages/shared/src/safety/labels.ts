import type { SafetyCategory, SafetyVerdict } from '@lapka/contracts'

/**
 * The key of a verdict's caption. The caption answers the question the
 * category asks: a food is «can it eat this», a plant «is it dangerous if it
 * chews it», a medicine or a household substance «is it dangerous if it
 * swallows it» (the table «Что значит вердикт» in the design spec).
 */
export type SafetyVerdictLabelKey = 'can' | 'nonToxic' | 'caution' | 'lowRisk' | 'cannot' | 'dangerous' | 'noData'

const LABELS: Record<SafetyCategory, Record<SafetyVerdict, SafetyVerdictLabelKey>> = {
  food: { safe: 'can', caution: 'caution', danger: 'cannot' },
  plant: { safe: 'nonToxic', caution: 'caution', danger: 'dangerous' },
  // The schema forbids `safe` for a household substance and anything but
  // `danger` for a medicine. Should one slip through, it reads stricter, never softer.
  household: { safe: 'lowRisk', caution: 'lowRisk', danger: 'dangerous' },
  medicine: { safe: 'dangerous', caution: 'dangerous', danger: 'dangerous' },
}

export function verdictLabelKey(category: SafetyCategory, verdict: SafetyVerdict | 'unknown'): SafetyVerdictLabelKey {
  return verdict === 'unknown' ? 'noData' : LABELS[category][verdict]
}
