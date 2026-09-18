import { describe, expect, it } from 'vitest'
import { isApprovalChat, isTelegramWebhookAuthorized } from '@/server/extra-check/telegram'

describe('isTelegramWebhookAuthorized', () => {
  it('accepts the secret Telegram was given', () => {
    expect(isTelegramWebhookAuthorized('s3cret', 's3cret')).toBe(true)
  })

  it('refuses a wrong secret', () => {
    expect(isTelegramWebhookAuthorized('wrong', 's3cret')).toBe(false)
  })

  it('refuses a prefix of the secret', () => {
    expect(isTelegramWebhookAuthorized('s3c', 's3cret')).toBe(false)
  })

  it('refuses a request with no header', () => {
    expect(isTelegramWebhookAuthorized(null, 's3cret')).toBe(false)
  })

  // Approving a request grants a paid check, so an unconfigured deployment has
  // to refuse callers rather than trust them.
  it.each([
    ['unset', undefined],
    ['empty', ''],
  ])('refuses every caller when the secret is %s', (_name, secret) => {
    expect(isTelegramWebhookAuthorized('anything', secret)).toBe(false)
    expect(isTelegramWebhookAuthorized(null, secret)).toBe(false)
  })
})

describe('isApprovalChat', () => {
  it('accepts the chat the approval buttons were posted to', () => {
    expect(isApprovalChat(-100200300, '-100200300')).toBe(true)
  })

  it('refuses any other chat', () => {
    expect(isApprovalChat(-999, '-100200300')).toBe(false)
  })

  it('refuses a callback that names no chat', () => {
    expect(isApprovalChat(undefined, '-100200300')).toBe(false)
  })
})
