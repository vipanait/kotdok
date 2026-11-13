import 'server-only'

import type { CheckQuestionAlert } from '@lapka/contracts'
import type { createServiceClient } from '@/server/supabase/server'

type SupabaseService = ReturnType<typeof createServiceClient>

/**
 * What the owner asked after a check, for a re-check of the same episode: the
 * questions and whether one raised an alert. The model's own answers are left
 * out — a re-check should weigh what the owner said, not what was said back —
 * and so are off-topic questions, which say nothing about the pet.
 *
 * Its own module: the follow-up service reads it, and the questions service
 * imports the analysis, which imports the follow-up service.
 */
export async function questionsForRecheck(
  supabase: SupabaseService,
  userId: string,
  checkId: string,
): Promise<{ question: string; alert: CheckQuestionAlert }[]> {
  const { data, error } = await supabase
    .from('check_questions')
    .select('question, alert')
    .eq('check_id', checkId)
    .eq('user_id', userId)
    .not('answer', 'is', null)
    .eq('off_topic', false)
    .order('created_at', { ascending: true })
  if (error) return []
  return (data ?? []) as { question: string; alert: CheckQuestionAlert }[]
}
