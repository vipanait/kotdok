import ru from '@/shared/i18n/dictionaries/ru'
import { URGENCY_KEYS, urgencyTitle } from '@/shared/utils/urgency'
import type { SymptomPage } from '../schema'

/**
 * The signs of a symptom sorted by the app's five levels, most urgent first.
 * The name and the instruction of each level are the app's own (the `urgency`
 * dictionary), so an article and a check never word a level differently.
 */
export default function UrgencyLevels({ signs }: { signs: SymptomPage['signs'] }) {
  return (
    <section aria-labelledby="levels-title" className="article-section">
      <h2 id="levels-title">Насколько это срочно</h2>
      <div className="levels">
        {URGENCY_KEYS.filter(key => signs[key].length > 0).map(key => (
          <div key={key} className={`card level ${key}`}>
            <div className="level-head">
              <span className="badge"><i aria-hidden="true" />{urgencyTitle(ru.urgency[key].label)}</span>
              <strong>{ru.urgency[key].action}</strong>
            </div>
            <ul>
              {signs[key].map(sign => <li key={sign}>{sign}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
