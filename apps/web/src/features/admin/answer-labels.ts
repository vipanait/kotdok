import type { Dictionary } from '@/shared/i18n/dictionaries/ru'

export type AnswerQuestion = 'appetite' | 'activity' | 'duration' | 'stool'

/**
 * The questionnaire's own words for its answers, from the check form's
 * dictionary, so the admin pages say «Не ест» exactly as the owner saw it.
 */
export function answerLabels(check: Dictionary['check']) {
  return {
    questions: {
      appetite: check.appetite,
      activity: check.activity,
      duration: check.duration,
      stool: check.stool,
      pain: check.painSigns,
    },
    appetite: { normal: check.appetiteNormal, reduced: check.appetiteReduced, none: check.appetiteNone },
    activity: { normal: check.activityNormal, low: check.activityLow, lethargic: check.activityLethargic },
    duration: {
      today: check.durationToday,
      '2-3days': check.duration2_3days,
      '4-7days': check.duration4_7days,
      'week+': check.durationWeekPlus,
    },
    stool: { normal: check.stoolNormal, loose: check.stoolLoose, absent: check.stoolAbsent, bloody: check.stoolBloody },
    pain: {
      tense: check.painTense,
      hunched: check.painHunched,
      grimace: check.painGrimace,
      touch_sensitive: check.painTouchSensitive,
      hiding: check.painHiding,
      vocalizing: check.painVocalizing,
    },
  }
}

export type AnswerLabels = ReturnType<typeof answerLabels>

/** One stored answer in words; an unknown value is shown as stored. */
export function answerText(labels: AnswerLabels, question: AnswerQuestion, value: string): string {
  return (labels[question] as Record<string, string>)[value] ?? value
}
