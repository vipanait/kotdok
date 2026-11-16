import { describe, expect, it } from 'vitest'
import { systemPromptForSpecies } from '@/server/symptom-check/analyze-symptom-check'

/** The lists moved to `triage-signs.ts` so a second prompt can read them; the analysis must read what it always did. */
describe('the triage levels of the analysis prompt', () => {
  it('still names the cat signs word for word', () => {
    const prompt = systemPromptForSpecies('cat', 'ru')
    expect(prompt).toContain(
      'EMERGENCY (go now): seizures, difficulty breathing, urinary blockage in male cats, collapse, suspected poisoning, trauma\n' +
        'URGENT (within 24h): not eating >24h, vomiting >3x, blood in urine/stool, hiding + lethargy combo, significant weight loss\n' +
        'MONITOR (watch 48h):',
    )
  })

  it('still names the dog signs word for word', () => {
    const prompt = systemPromptForSpecies('dog', 'en')
    expect(prompt).toContain(
      'EMERGENCY (go now): seizures, difficulty breathing, suspected GDV/bloat (non-productive retching + distended abdomen), collapse, suspected poisoning (xylitol, chocolate, grapes, rodenticide), trauma, heatstroke, pale gums, continuous uncontrolled bleeding\n' +
        'URGENT (within 24h): not eating >24h, vomiting >3x, blood in urine/stool, marked lethargy, significant limp/pain, puppy with diarrhea/vomiting (parvo risk), sudden behavioral change with pain signs\n' +
        'MONITOR (watch 48h):',
    )
  })
})
