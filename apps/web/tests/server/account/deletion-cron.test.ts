import { describe, expect, it } from 'vitest'
import { isCronAuthorized } from '@/server/account/deletion-cron'

describe('who may run the deletion cron', () => {
  it('accepts exactly the configured secret as a bearer token', () => {
    expect(isCronAuthorized('Bearer s3cret-value', 's3cret-value')).toBe(true)
  })

  it.each([
    [null, 's3cret-value'],
    ['', 's3cret-value'],
    ['s3cret-value', 's3cret-value'],
    ['Bearer wrong', 's3cret-value'],
    ['Bearer s3cret-valu', 's3cret-value'],
    ['Bearer s3cret-value', undefined],
    ['Bearer ', ''],
  ])('refuses %j when the secret is %j', (header, secret) => {
    expect(isCronAuthorized(header, secret)).toBe(false)
  })
})
