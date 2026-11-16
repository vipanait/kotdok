import 'server-only'

import type { CheckQuestionThread } from '@lapka/contracts'
import { createServiceClient } from '@/server/supabase/server'
import { getQuestionThread } from '@/server/check-questions/check-question-service'

/**
 * The questions asked about a saved result, read with the page (CQ-02).
 * `null` when they cannot be read: the result is shown without the block
 * rather than failing over a part of it.
 */
export async function loadResultQuestions(userId: string, checkId: string): Promise<CheckQuestionThread | null> {
  try {
    const result = await getQuestionThread(createServiceClient(), userId, checkId)
    if (result.ok) return result.data
    console.error('check questions could not be read:', result.reason)
    return null
  } catch (error) {
    console.error('check questions could not be read:', error)
    return null
  }
}
