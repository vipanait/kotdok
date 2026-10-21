import { describe, expect, it } from 'vitest'
import type { Medication } from '@lapka/contracts'
import { doseTimesKey } from '@/features/medical-record/medications/dose-times-field'
import PetPhotoField from '@/features/pets/PetPhotoField'
import { drawOnWhite } from '@/features/pets/prepare-photo'
import { render, tag } from '../../components/static-render'

const course: Medication = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Нефростоп',
  dosage: '1 таблетка',
  started_on: '2026-10-15',
  ended_on: null,
  ongoing: true,
  source: 'record',
  reminder_times: ['08:00'],
}

describe('the course page follows times set elsewhere', () => {
  it('starts the times field again when the stored times change, so a tick never sends an old list', () => {
    const before = doseTimesKey(course)
    const afterPhone = doseTimesKey({ ...course, reminder_times: ['08:00', '20:00'] })
    const afterEnd = doseTimesKey({ ...course, reminder_times: [] })
    expect(new Set([before, afterPhone, afterEnd]).size).toBe(3)
    expect(doseTimesKey({ ...course })).toBe(before)
  })
})

describe('the photo field and the keyboard', () => {
  it('the hidden file input is not a tab stop of its own: the visible button opens it', () => {
    const html = render(<PetPhotoField species="cat" photoUrl={null} change={{ kind: 'keep' }} onChange={() => {}} />)
    expect(tag(html, 'input', (input) => input.attrs.type === 'file').attrs.tabindex).toBe('-1')
  })
})

describe('a photo made smaller in the browser', () => {
  it('is drawn on white, so a transparent picture does not turn black as a JPEG', () => {
    const calls: string[] = []
    const context = {
      set fillStyle(value: string) {
        calls.push(`fill ${value}`)
      },
      fillRect: (x: number, y: number, w: number, h: number) => calls.push(`rect ${x},${y},${w},${h}`),
      drawImage: () => calls.push('image'),
    }
    drawOnWhite(context as unknown as CanvasRenderingContext2D, {} as CanvasImageSource, 100, 80)
    expect(calls).toEqual(['fill #FFFFFF', 'rect 0,0,100,80', 'image'])
  })
})
