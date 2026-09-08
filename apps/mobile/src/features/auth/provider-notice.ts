/**
 * What the sign-in and registration screens say after the provider's browser
 * closes.
 *
 * Both screens ask the same question and must answer it the same way, so the
 * answer lives here rather than twice in JSX. A cancellation is the user's own
 * doing: it is reported, because silence after a tap reads as a broken button,
 * but in a neutral tone rather than as a fault.
 */

import type { ProviderOutcome } from '@/lib/provider-sign-in'

export type ProviderNotice = { text: string; tone: 'info' | 'error' }

/** @returns the notice to show, or null when there is nothing to say. */
export function providerNoticeFor(outcome: ProviderOutcome): ProviderNotice | null {
  // Success says nothing: the app is about to replace this screen anyway.
  if (outcome.kind === 'session') return null
  if (outcome.kind === 'cancelled') return { text: 'Вход отменён', tone: 'info' }
  return { text: outcome.message, tone: 'error' }
}
