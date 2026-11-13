import type { PetSpecies } from '@/shared/types'

/**
 * What sends a pet to a clinic now, and what to a vet within a day, per
 * species. The analysis prompt lists them as its EMERGENCY and URGENT levels;
 * an answer to a question about a check reads the same lists to tell when the
 * question has made the picture worse (`alert`). One list, so the two cannot
 * disagree about what is dangerous.
 */
export const TRIAGE_SIGNS: Record<PetSpecies, { emergency: string; urgent: string }> = {
  cat: {
    emergency: 'seizures, difficulty breathing, urinary blockage in male cats, collapse, suspected poisoning, trauma',
    urgent: 'not eating >24h, vomiting >3x, blood in urine/stool, hiding + lethargy combo, significant weight loss',
  },
  dog: {
    emergency:
      'seizures, difficulty breathing, suspected GDV/bloat (non-productive retching + distended abdomen), collapse, suspected poisoning (xylitol, chocolate, grapes, rodenticide), trauma, heatstroke, pale gums, continuous uncontrolled bleeding',
    urgent:
      'not eating >24h, vomiting >3x, blood in urine/stool, marked lethargy, significant limp/pain, puppy with diarrhea/vomiting (parvo risk), sudden behavioral change with pain signs',
  },
}
