import { describe, expect, it } from 'vitest'
import { addInterval, matchesCatalog, normaliseQuery } from './catalog-search'

const nobivac = { name: 'Нобивак Tricat Trio', manufacturer: 'MSD', aliases: ['Nobivac Tricat Trio'] }
const purevax = { name: 'Пуревакс RCP', manufacturer: 'Boehringer Ingelheim', aliases: ['Purevax RCP'] }

describe('catalogue search (MR-04.2)', () => {
  it('finds «нобив» in any case', () => {
    expect(matchesCatalog(nobivac, 'нобив')).toBe(true)
    expect(matchesCatalog(nobivac, 'НОБИВ')).toBe(true)
    expect(matchesCatalog(purevax, 'нобив')).toBe(false)
  })

  it('finds by the maker and by the Latin name', () => {
    expect(matchesCatalog(nobivac, 'msd')).toBe(true)
    expect(matchesCatalog(purevax, 'boehr')).toBe(true)
    expect(matchesCatalog(nobivac, 'nobiv')).toBe(true)
  })

  it('finds what was typed with the wrong keyboard layout, either way', () => {
    // «нобив» typed on an English layout, and «nobiv» on a Russian one.
    expect(matchesCatalog(nobivac, 'yj,bd')).toBe(true)
    expect(matchesCatalog(nobivac, 'тщишм')).toBe(true)
  })

  it('treats ё as е and ignores extra spaces', () => {
    expect(normaliseQuery('  Ёж   Нобивак ')).toBe('еж нобивак')
  })

  it('matches everything for an empty query', () => {
    expect(matchesCatalog(nobivac, '  ')).toBe(true)
  })
})

describe('intervals on the calendar', () => {
  it('keeps weeks and months apart (spec: 12 weeks is not 3 months)', () => {
    expect(addInterval('2026-09-24', { value: 12, unit: 'week' })).toBe('2026-12-17')
    expect(addInterval('2026-09-24', { value: 3, unit: 'month' })).toBe('2026-12-24')
  })

  it('lands on the last day of a shorter month', () => {
    expect(addInterval('2026-08-31', { value: 1, unit: 'month' })).toBe('2026-09-30')
    expect(addInterval('2028-02-29', { value: 1, unit: 'year' })).toBe('2029-02-28')
  })

  it('counts days as days', () => {
    expect(addInterval('2026-12-25', { value: 10, unit: 'day' })).toBe('2027-01-04')
  })
})
