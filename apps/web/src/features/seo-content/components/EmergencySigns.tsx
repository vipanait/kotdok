import ru from '@/shared/i18n/dictionaries/ru'
import { urgencyTitle } from '@/shared/utils/urgency'
import type { Species } from '../schema'

/**
 * Signs that mean a clinic now, whatever the symptom — the EMERGENCY lists of
 * the app's analysis rules (analyze-symptom-check.ts), in owners' words.
 */
const SIGNS: Record<Species | 'any', string[]> = {
  cat: [
    'Тяжело дышит, дышит с открытым ртом',
    'Судороги, обморок, не может стоять',
    'Кот часто садится в лоток, а мочи почти нет',
    'Могла съесть яд, лилию или лекарство для людей',
    'Упала с высоты, попала под машину, другая травма',
  ],
  dog: [
    'Тяжело дышит, бледные или синюшные дёсны',
    'Судороги, обморок, не может стоять',
    'Пытается вырвать, но не может, живот вздут',
    'Могла съесть ксилит, шоколад, виноград, яд от грызунов',
    'Перегрелась, кровотечение не останавливается, травма',
  ],
  any: [
    'Тяжело дышит или дышит с открытым ртом',
    'Судороги, обморок, не может стоять',
    'Мог съесть яд, лекарство для людей, ядовитое растение',
    'Кот не может помочиться; у собаки вздут живот и безрезультатные позывы на рвоту',
    'Травма, кровотечение, которое не останавливается',
  ],
}

export function EmergencySigns({ species = 'any' }: { species?: Species | 'any' }) {
  const level = ru.urgency.emergency
  return (
    <section className="card level emergency" aria-labelledby="now-title">
      <div className="level-head">
        <span className="badge"><i aria-hidden="true" />{urgencyTitle(level.label)}</span>
        <strong id="now-title">{level.action}, если:</strong>
      </div>
      <ul>{SIGNS[species].map(sign => <li key={sign}>{sign}</li>)}</ul>
    </section>
  )
}
