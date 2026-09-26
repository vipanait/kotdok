'use client'

import Link from 'next/link'
import { useId, type RefObject } from 'react'
import { useTranslations } from '@/components/LocaleProvider'

interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Set when the person tried to go on without ticking it. */
  invalid: boolean
  inputRef?: RefObject<HTMLInputElement | null>
}

/**
 * The one box to tick: consent to personal data processing, unticked until the
 * person ticks it, with the text a click away. The terms of use are not ticked
 * anywhere — the button accepts them, and `ConsentTerms` says so.
 */
export default function ConsentCheckbox({ checked, onChange, invalid, inputRef }: Props) {
  const t = useTranslations().consent
  const id = useId()
  const errorId = useId()

  return (
    <div className="auth-terms">
      <label className="terms" htmlFor={id}>
        <input
          ref={inputRef}
          id={id}
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
        />
        <span>
          {t.checkboxPrefix}{' '}
          <Link href="/legal/personal-data" target="_blank" rel="noopener noreferrer">
            {t.checkboxLink}
          </Link>
        </span>
      </label>
      {invalid && <p id={errorId} className="field-error" role="alert">{t.errorRequired}</p>}
    </div>
  )
}

/** «Продолжая, вы принимаете соглашение и политику»: acceptance by the button. */
export function ConsentTerms() {
  const t = useTranslations().consent

  return (
    <p className="auth-terms-note">
      {t.termsPrefix}{' '}
      <Link href="/legal" target="_blank" rel="noopener noreferrer">{t.termsLink}</Link>{' '}
      {t.termsAnd}{' '}
      <Link href="/legal/privacy" target="_blank" rel="noopener noreferrer">{t.policyLink}</Link>
    </p>
  )
}
