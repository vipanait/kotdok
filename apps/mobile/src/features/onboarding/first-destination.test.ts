import { describe, expect, it } from 'vitest'
import { firstDestination } from './first-destination'

describe('where the splash hands over', () => {
  it('sends a stored session to the pets, first launch or not', () => {
    expect(firstDestination({ signedIn: true, firstLaunch: true })).toBe('/pets')
    expect(firstDestination({ signedIn: true, firstLaunch: false })).toBe('/pets')
  })

  it('shows the intro only on the first launch of the install', () => {
    expect(firstDestination({ signedIn: false, firstLaunch: true })).toBe('/intro')
  })

  it('goes straight to sign-in on every later launch', () => {
    expect(firstDestination({ signedIn: false, firstLaunch: false })).toBe('/sign-in')
  })
})
