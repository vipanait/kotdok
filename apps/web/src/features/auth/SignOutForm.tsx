'use client'

import { useRef } from 'react'
import { CSRF_FIELD_NAME, getCsrfToken } from '@/shared/security/csrf-client'

export default function SignOutForm({
  label,
  className = 'link',
  icon,
}: {
  label: string
  className?: string
  icon?: React.ReactNode
}) {
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
      <button type="submit" className={className}>
        {icon}
        {label}
      </button>
    </form>
  )
}
