'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { quizOutcome, type QuizLevel, type QuizOutcome } from '../quiz'

export interface QuizText {
  label: string
  action: string
}

interface Props {
  questions: { question: string; level: QuizLevel }[]
  /** Name and instruction of each outcome, from the app's `urgency` dictionary. */
  outcomes: Record<QuizOutcome, QuizText>
  signUpHref: string
}

const NOTE: Record<QuizOutcome, string> = {
  emergency: 'Не отвечайте дальше: позвоните в ближайшую ветеринарную клинику и езжайте туда.',
  urgent: 'Запишитесь к ветеринарному врачу на ближайшие сутки. Если станет хуже — езжайте сразу.',
  monitor: 'По этим вопросам срочных признаков нет. Наблюдайте 48 часов и запишите, что меняется. Если появится что-то из списка выше или станет хуже — к врачу.',
}

/**
 * «Это срочно?»: yes/no questions counted in the browser by the page's own
 * rules (`quiz.ts`). Nothing is sent anywhere; the answers live in this
 * component's state and are gone with the page.
 *
 * The result stands above the questions: an emergency is decided by the first
 * yes, and the owner is still looking at that question, not at the bottom of
 * the list. When it appears it is scrolled into view and focused.
 */
export default function UrgencyQuiz({ questions, outcomes, signUpHref }: Props) {
  const [answers, setAnswers] = useState<(boolean | null)[]>(() => questions.map(() => null))
  const outcome = quizOutcome(questions, answers)
  const resultRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!outcome || !resultRef.current) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    resultRef.current.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
    resultRef.current.focus({ preventScroll: true })
  }, [outcome])

  const answer = (index: number, value: boolean) =>
    setAnswers(current => current.map((old, i) => (i === index ? value : old)))

  return (
    <section aria-labelledby="quiz-title" className="card quiz">
      <h2 id="quiz-title">Это срочно?</h2>
      <p>Ответьте «да» или «нет» на каждый вопрос — подскажем, насколько быстро нужен врач. Ответы никуда не отправляются.</p>

      <div aria-live="polite" className="quiz-result-slot">
        {outcome && (
          <div ref={resultRef} tabIndex={-1} className={`quiz-result ${outcome}`}>
            <span className="badge"><i aria-hidden="true" />{outcomes[outcome].label}</span>
            <h3>{outcomes[outcome].action}</h3>
            <p>{NOTE[outcome]}</p>
            {outcome !== 'emergency' && (
              <p>
                Чтобы учесть возраст, породу и историю питомца, опишите ситуацию в Лапке —{' '}
                <Link href={signUpHref} className="link">после регистрации 2 проверки бесплатно</Link>.
              </p>
            )}
            <p className="small">Это не диагноз: что происходит на самом деле, может сказать только врач после осмотра.</p>
          </div>
        )}
      </div>

      <ol className="quiz-questions">
        {questions.map((item, i) => (
          <li key={item.question}>
            <div className="quiz-row" role="group" aria-labelledby={`quiz-q-${i}`}>
              <span id={`quiz-q-${i}`} className="quiz-question">{item.question}</span>
              <div className="segmented">
                <button type="button" aria-pressed={answers[i] === true} onClick={() => answer(i, true)}>Да</button>
                <button type="button" aria-pressed={answers[i] === false} onClick={() => answer(i, false)}>Нет</button>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="quiz-foot">
        {!outcome && answers.some(a => a !== null) && (
          <p className="small">Ответьте на все вопросы, чтобы увидеть результат.</p>
        )}
        <button
          type="button"
          className="link quiz-reset"
          hidden={answers.every(a => a === null)}
          onClick={() => setAnswers(questions.map(() => null))}
        >
          Начать заново
        </button>
      </div>
    </section>
  )
}
