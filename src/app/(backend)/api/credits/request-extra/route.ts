import { NextResponse } from 'next/server'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { submitExtraCheckRequest } from '@/server/extra-check/extra-check-service'

function statusForError(message: string): number {
  if (message.includes('Unauthorized')) return 401
  if (message.includes('profile_not_found')) return 404
  if (message.includes('credits_remaining')) return 409
  if (message.includes('pending_request_exists')) return 409
  if (message.startsWith('telegram_dispatch_failed:')) return 502
  return 500
}

export async function POST() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { requestId } = await submitExtraCheckRequest(user.id)
    return NextResponse.json({
      status: 'pending',
      request_id: requestId,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'create_extra_check_request_failed'
    return NextResponse.json(
      { error: message },
      { status: statusForError(message) },
    )
  }
}
