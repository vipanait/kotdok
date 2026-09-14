import type { ProviderId } from '@/lib/provider-sign-in'

/**
 * The order of the sign-in buttons, which differs by platform on purpose.
 *
 * On an iPhone Apple comes first: it is one tap and Face ID, and Apple asks
 * that its button never needs scrolling to — first place keeps it above the
 * fold on the smallest screen. Elsewhere few people have an Apple Account, so
 * it goes last. The owner's decision of 14 September 2026.
 *
 * Kept free of React Native so the rule is testable in node.
 */
export function providerOrder(os: string): ProviderId[] {
  return os === 'ios' ? ['apple', 'custom:yandex', 'google'] : ['custom:yandex', 'google', 'apple']
}
