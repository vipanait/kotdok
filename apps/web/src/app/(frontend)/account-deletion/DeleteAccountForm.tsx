'use client'

import { useState } from 'react'
import { csrfHeaders } from '@/shared/security/csrf-client'

type Stage =
  | { kind: 'idle' }
  | { kind: 'working' }
  /** The session is real but old. Signing in again is the fix, not an error. */
  | { kind: 'reauth' }
  | { kind: 'accepted'; receipt: string }
  | { kind: 'failed' }

/**
 * The button, and the two things that must happen in order behind it.
 *
 * The receipt is made here and written down **before** the request goes: the
 * case it exists for is an answer that never arrives, and one created after the
 * answer would be missing exactly then. It is kept in `localStorage` rather
 * than with the session, because the session is about to stop existing and the
 * receipt has to outlive it.
 */
export default function DeleteAccountForm() {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })

  async function run() {
    setStage({ kind: 'working' })

    const proof = await fetch('/api/account-deletion/reauth', {
      method: 'POST',
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
      body: '{}',
    })

    if (proof.status === 401) {
      setStage({ kind: 'reauth' })
      return
    }
    if (!proof.ok) {
      setStage({ kind: 'failed' })
      return
    }

    const { token } = (await proof.json()) as { token: string }

    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    const receipt = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

    try {
      localStorage.setItem('lapka.deletion-receipt', receipt)
    } catch {
      // A browser that refuses storage still gets to delete the account; they
      // just lose the way to check the status later, and the page says so.
    }

    const response = await fetch('/api/account-deletion', {
      method: 'POST',
      headers: csrfHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ receipt_secret: receipt, reauth_token: token }),
    })

    setStage(response.status === 202 ? { kind: 'accepted', receipt } : { kind: 'failed' })
  }

  if (stage.kind === 'accepted') {
    return (
      <div className="mt-4">
        <p className="font-bold">Запрос принят</p>
        <p className="mt-2 text-black/[.7]">
          Мы начали удаление. Это не мгновенно — страницу можно закрыть. Номер квитанции
          сохранён в этом браузере, по нему можно узнать статус позже.
        </p>
        <p className="mt-3 break-all rounded-xl bg-black/[.04] p-3 font-mono text-xs">
          {stage.receipt}
        </p>
        <p className="mt-2 text-sm text-black/[.5]">
          Сохраните эту строку, если собираетесь спрашивать статус из другого браузера.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4">
      {stage.kind === 'reauth' ? (
        <p className="mb-3 text-black/[.7]">
          С момента входа прошло много времени. Войдите заново и повторите — так удаление не
          сможет запустить тот, кто просто сел за ваш компьютер.
        </p>
      ) : null}

      {stage.kind === 'failed' ? (
        <p className="mb-3 text-[#B3261E]">Не получилось. Попробуйте ещё раз или напишите нам.</p>
      ) : null}

      <button
        type="button"
        onClick={() => void run()}
        disabled={stage.kind === 'working'}
        className="inline-flex items-center justify-center rounded-full border-2 border-[#B3261E] px-6 py-3 font-bold text-[#B3261E] transition-colors hover:bg-[#B3261E] hover:text-white disabled:opacity-50"
      >
        {stage.kind === 'working' ? 'Отправляем…' : 'Удалить аккаунт'}
      </button>
    </div>
  )
}
