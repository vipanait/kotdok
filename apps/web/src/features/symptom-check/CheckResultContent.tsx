import Link from 'next/link'
import type { SymptomCheckView } from '@lapka/contracts'
import PetAvatar from '@/components/PetAvatar'
import Icon from '@/components/ui/Icon'
import ResultFeedback from '@/features/symptom-check/ResultFeedback'
import { checkOptions, formatCheckDateTime } from '@/features/symptom-check/check-options'
import type { Locale } from '@/shared/i18n/config'
import type { Dictionary } from '@/shared/i18n/dictionaries/ru'
import type { CheckPet } from '@/shared/types'
import { petSummary } from '@/shared/utils/pet-summary'
import { CLINIC_URGENCIES, VET_URGENCIES, urgencyTitle } from '@/shared/utils/urgency'

/** A map search for clinics near the owner, in the site's language. */
function clinicSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

interface Props {
  check: SymptomCheckView
  dict: Dictionary
  locale: Locale
  /** The owner's time zone; the browser's own when rendered on the client. */
  timeZone?: string
  /** The pet's current profile, when it still exists: adds breed and age. */
  pet?: CheckPet | null
  /**
   * The result shown in place of the form (no saved id came back): "New check"
   * resets the form instead of linking to it.
   */
  onNewCheck?: () => void
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => String(item)) : []
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

/**
 * One result: urgency first, then what to do, then the details; the pet and
 * the feedback beside it. Renders on the server for a saved result and inside
 * the check form for the rare answer that came back without an id, so it
 * takes the dictionary instead of reading context.
 *
 * Every text is the service's answer or the dictionary's; a block exists only
 * when its data does.
 */
export default function CheckResultContent({ check, dict, locale, timeZone, pet, onNewCheck }: Props) {
  const t = dict.check
  const urgency = check.urgency
  const level = dict.urgency[urgency]
  const full = check.full_response ?? {}
  const isHealthy = urgency === 'healthy'
  // The answer's language, which may differ from the page's.
  const answerLang = check.locale !== locale ? check.locale : undefined

  const options = checkOptions(t)
  const appetite = text(full.appetite)
  const activity = text(full.activity)
  const duration = text(full.duration)
  const stool = text(full.stool)
  const painSigns = stringList(full.pain_signs)
  const answers = [
    appetite && `${t.appetitePrefix}: ${options.labels.appetite[appetite] ?? appetite}`,
    activity && `${t.activityPrefix}: ${options.labels.activity[activity] ?? activity}`,
    duration && `${t.durationPrefix}: ${options.labels.duration[duration] ?? duration}`,
    stool && `${t.stoolPrefix}: ${options.labels.stool[stool] ?? stool}`,
    ...painSigns.map(sign => `${t.painSignsPrefix}: ${options.labels.painSigns[sign] ?? sign}`),
  ].filter((item): item is string => !!item)

  const photoObservations = full.has_photo ? text(full.photo_observations) : null
  const additionalInfo = stringList(full.additional_pet_info_needed).length
    ? stringList(full.additional_pet_info_needed)
    : stringList(full.additional_cat_info_needed)
  const disclaimer = text(full.disclaimer) ?? t.disclaimerFallback

  const showSteps = !isHealthy && check.home_care_steps.length > 0
  const showVetQuestions = VET_URGENCIES.has(urgency) && check.vet_questions.length > 0
  const showWarning = !isHealthy && !!check.species_specific_warning
  const warningTitle = check.pet_species === 'dog'
    ? t.dogWarning
    : check.pet_species === 'cat'
      ? t.catWarning
      : t.petWarning

  const petName = pet?.name ?? check.pet_name
  const petSpecies = pet?.species ?? check.pet_species
  const petLine = (pet && petSummary(pet, dict, locale))
    || (petSpecies === 'dog' ? t.speciesDog : petSpecies === 'cat' ? t.speciesCat : '')
  const when = formatCheckDateTime(check.created_at, locale, timeZone)
  const newCheckHref = pet ? `/check?pet=${pet.id}` : '/check'

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{t.resultTitle}</h1>
          <p>{petName ? `${petName} · ${when}` : when}</p>
        </div>
        <Link href="/checks" className="link">
          <Icon name="back" />
          {t.backToHistory}
        </Link>
      </div>

      <section className={`result-hero ${urgency}`} aria-labelledby="result-urgency">
        <span className="small">{t.urgencyEyebrow}</span>
        <h2 id="result-urgency" className="result-title">{urgencyTitle(level?.label)}</h2>
        <p>{level?.action}</p>
        {check.urgency_reason && (
          <p className="result-reason" lang={answerLang}>{check.urgency_reason}</p>
        )}
        {CLINIC_URGENCIES.has(urgency) && (
          <div className="result-hero-actions">
            <a href={clinicSearchUrl(t.clinicSearchQuery)} target="_blank" rel="noopener noreferrer" className="btn primary">
              {t.findClinic}
              <Icon name="arrow" />
            </a>
          </div>
        )}
      </section>

      <div className="result-layout">
        <div>
          {isHealthy && (
            <section className="card">
              <h2>{t.keepCareTitle}</h2>
              <p>{t.keepCare}</p>
            </section>
          )}

          {showSteps && (
            <section className="card">
              <h2>{t.nextSteps}</h2>
              <ol lang={answerLang}>
                {check.home_care_steps.map((step, i) => <li key={i}>{step}</li>)}
              </ol>
            </section>
          )}

          {showVetQuestions && (
            <section className="card">
              <h2>{t.vetQuestionsTitle}</h2>
              <ul lang={answerLang}>
                {check.vet_questions.map((question, i) => <li key={i}>{question}</li>)}
              </ul>
            </section>
          )}

          {showWarning && (
            <section className={`card result-warning ${urgency}`}>
              <h2>{warningTitle}</h2>
              <p lang={answerLang}>{check.species_specific_warning}</p>
            </section>
          )}

          <section className="card">
            <h2>{t.detailsTitle}</h2>
            <div className="result-details">
              {(check.symptoms_input || answers.length > 0) && (
                <details className="disclosure" open={isHealthy || undefined}>
                  <summary>{t.youDescribedTitle}</summary>
                  <div>
                    {check.symptoms_input && <p className="result-symptoms">{check.symptoms_input}</p>}
                    {answers.length > 0 && (
                      <div className="chips result-answers">
                        {answers.map(answer => <span key={answer} className="chip static">{answer}</span>)}
                      </div>
                    )}
                  </div>
                </details>
              )}

              {photoObservations && (
                <details className="disclosure">
                  <summary>{t.photoObservations}</summary>
                  <p lang={answerLang}>{photoObservations}</p>
                </details>
              )}

              {check.possible_causes.length > 0 && (
                <details className="disclosure">
                  <summary>{t.possibleCauses}</summary>
                  <ul lang={answerLang}>
                    {check.possible_causes.map((cause, i) => <li key={i}>{cause}</li>)}
                  </ul>
                </details>
              )}

              {additionalInfo.length > 0 && (
                <details className="disclosure">
                  <summary>{t.additionalPetInfoNeeded}</summary>
                  <ul lang={answerLang}>
                    {additionalInfo.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                </details>
              )}
            </div>
            <p className="footnote result-disclaimer" lang={text(full.disclaimer) ? answerLang : undefined}>
              {disclaimer}
            </p>
          </section>
        </div>

        <aside className="stack">
          <div className="card">
            {petName && (
              <>
                <div className="row">
                  <PetAvatar species={petSpecies} />
                  <div className="result-pet">
                    <h3>{petName}</h3>
                    {petLine && <p className="small">{petLine}</p>}
                  </div>
                </div>
                <div className="divider" />
              </>
            )}
            {check.id && <p className="small">{t.resultSaved}</p>}
            {onNewCheck ? (
              <button type="button" className="link" onClick={onNewCheck}>
                {t.newCheck}
                <Icon name="arrow" />
              </button>
            ) : (
              <Link href={newCheckHref} className="link">
                {t.newCheck}
                <Icon name="arrow" />
              </Link>
            )}
          </div>
          {check.id && <ResultFeedback checkId={check.id} />}
        </aside>
      </div>
    </>
  )
}
