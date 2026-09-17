import { describe, expect, it } from 'vitest'
import { providerOrder } from './provider-order'

describe('the order of the sign-in buttons', () => {
  it('puts Apple first on an iPhone', () => {
    expect(providerOrder('ios')).toEqual(['apple', 'custom:yandex', 'google'])
  })

  it('puts Apple last everywhere else', () => {
    expect(providerOrder('android')).toEqual(['custom:yandex', 'google', 'apple'])
  })

  it('offers every provider exactly once on both platforms', () => {
    for (const os of ['ios', 'android']) {
      expect([...providerOrder(os)].sort()).toEqual(['apple', 'custom:yandex', 'google'])
    }
  })
})
