'use client'

import { useRef } from 'react'
import { CSRF_FIELD_NAME, getCsrfToken } from '@/shared/security/csrf-client'

export default function SignOutForm({ label }: { label: string }) {
  const tokenRef = useRef<HTMLInputElement>(null)

  return (
    <form
      action="/api/auth/signout"
      method="post"
      onSubmit={() => {
        if (tokenRef.current) tokenRef.current.value = getCsrfToken()
      }}
    >
      <input ref={tokenRef} type="hidden" name={CSRF_FIELD_NAME} />
      <button className="app-link">{label}</button>
    </form>
  )
}
