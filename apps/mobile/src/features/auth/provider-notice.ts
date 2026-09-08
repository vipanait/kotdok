/**
 * What the sign-in and registration screens say after the provider's browser
 * closes.
 *
 * Both screens ask the same question and must answer it the same way, so the
 * answer lives here rather than twice in JSX.
 *
 * A cancellation says nothing. It was tried the other way first — a neutral
 * "Вход отменён" — and on the screen it read as a complaint about something the
 * user had just deliberately done. Closing the browser already returns them to
 * this screen, which is answer enough.
 */

import type { ProviderOutcome } from '@/lib/provider-sign-in'

export type ProviderNotice = { text: string; tone: 'info' | 'error' }

/** @returns the notice to show, or null when there is nothing to say. */
export function providerNoticeFor(outcome: ProviderOutcome): ProviderNotice | null {
  // Success says nothing: the app is about to replace this screen anyway.
  if (outcome.kind === 'session') return null
  if (outcome.kind === 'cancelled') return null
  return { text: outcome.message, tone: 'error' }
}
