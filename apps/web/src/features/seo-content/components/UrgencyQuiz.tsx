'use client'

import Link from 'next/link'
import { useState } from 'react'
import { quizOutcome, type QuizLevel, type QuizOutcome } from '../quiz'

export interface QuizText {
  label: string
  action: string
}

interface Props {
  questions: { question: string; level: QuizLevel }[]
  /** Name and instruction of each outcome, from the app's `urgency` dictionary. */
  outcomes: Record<QuizOutcome, QuizText>
  notice: string
  signUpHref: string
}

const NOTE: Record<QuizOutcome, string> = {
  emergency: 'Не ждите и не ищите ответ дальше: позвоните в ближайшую ветеринарную клинику и езжайте туда.',
  urgent: 'Запишитесь к ветеринарному врачу на ближайшие сутки. Если станет хуже — езжайте сразу.',
  monitor: 'По этим вопросам срочных признаков нет. Наблюдайте 48 часов и запишите, что меняется. Если появится что-то из списка выше или станет хуже — к врачу.',
}

/**
 * «Это срочно?»: yes/no questions counted in the browser by the page's own
 * rules (`quiz.ts`). Nothing is sent anywhere; the answers live in this
 * component's state and are gone with the page.
 */
export default function UrgencyQuiz({ questions, outcomes, notice, signUpHref }: Props) {
  const [answers, setAnswers] = useState<(boolean | null)[]>(() => questions.map(() => null))
  const outcome = quizOutcome(questions, answers)

  const answer = (index: number, value: boolean) =>
    setAnswers(current => current.map((old, i) => (i === index ? value : old)))

  return (
    <section aria-labelledby="quiz-title" className="card quiz">
      <h2 id="quiz-title">Это срочно?</h2>
      <p>Ответьте на несколько вопросов — подскажем, насколько быстро нужен врач. Ответы никуда не отправляются.</p>
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

      <div aria-live="polite" className="quiz-result-slot">
        {outcome && (
          <div className={`quiz-result ${outcome}`}>
            <span className="badge"><i aria-hidden="true" />{outcomes[outcome].label}</span>
            <h3>{outcomes[outcome].action}</h3>
            <p>{NOTE[outcome]}</p>
            {outcome !== 'emergency' && (
              <p>
                Чтобы учесть возраст, породу и историю питомца, опишите ситуацию в Лапке.{' '}
                <Link href={signUpHref} className="link">После регистрации 2 проверки бесплатно</Link>.
              </p>
            )}
            <p className="footnote">{notice}</p>
          </div>
        )}
        {!outcome && answers.some(a => a !== null) && (
          <p className="footnote">Ответьте на все вопросы, чтобы увидеть результат.</p>
        )}
      </div>
      <button
        type="button"
        className="link quiz-reset"
        hidden={answers.every(a => a === null)}
        onClick={() => setAnswers(questions.map(() => null))}
      >
        Начать заново
      </button>
    </section>
  )
}
