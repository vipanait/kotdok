import { describe, expect, it } from 'vitest'
import { addTypedTime, presetTimes, togglePreset } from '@/features/medical-record/medications/dose-times-field'

describe('«Своё время» and «+» (design `medication`)', () => {
  it('adds a typed time as «ЧЧ:ММ», in order, to the whole list the server will get', () => {
    expect(addTypedTime(['20:00'], '7:30')).toEqual({ ok: true, times: ['07:30', '20:00'] })
    expect(addTypedTime([], '0730')).toEqual({ ok: true, times: ['07:30'] })
  })

  it('refuses what is not a time', () => {
    expect(addTypedTime([], '25:00')).toEqual({ ok: false, reason: 'format' })
    expect(addTypedTime([], 'утром')).toEqual({ ok: false, reason: 'format' })
    expect(addTypedTime([], '')).toEqual({ ok: false, reason: 'format' })
    expect(addTypedTime([], '123')).toEqual({ ok: false, reason: 'format' })
  })

  it('refuses a time already there', () => {
    expect(addTypedTime(['07:30'], '7:30')).toEqual({ ok: false, reason: 'repeat' })
  })

  it('refuses a fifth time: at most four (MEDICATION_TIMES_MAX)', () => {
    expect(addTypedTime(['06:00', '12:00', '18:00', '22:00'], '08:00')).toEqual({ ok: false, reason: 'max' })
  })
})

describe('the preset times', () => {
  it('offers the usual times and any the course already has, in order', () => {
    expect(presetTimes([])).toEqual(['08:00', '12:00', '20:00'])
    expect(presetTimes(['07:30', '20:00'])).toEqual(['07:30', '08:00', '12:00', '20:00'])
  })

  it('a preset pressed adds it, pressed again takes it off — never past four', () => {
    expect(togglePreset(['08:00'], '20:00')).toEqual({ ok: true, times: ['08:00', '20:00'] })
    expect(togglePreset(['08:00', '20:00'], '08:00')).toEqual({ ok: true, times: ['20:00'] })
    expect(togglePreset(['06:00', '08:00', '18:00', '22:00'], '12:00')).toEqual({ ok: false, reason: 'max' })
  })
})
