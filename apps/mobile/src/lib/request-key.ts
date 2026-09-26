/**
 * A key for one user action, sent as Idempotency-Key so a retried or
 * double-tapped save is done once. Random enough to never collide for one
 * person; not a secret.
 */
export function newRequestKey(): string {
  const crypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (crypto?.randomUUID) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}
