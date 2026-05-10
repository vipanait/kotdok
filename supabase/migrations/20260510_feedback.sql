-- Add feedback tracking to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS feedback_submitted_at TIMESTAMPTZ;

-- User feedback table
CREATE TABLE IF NOT EXISTS public.user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating TEXT NOT NULL CHECK (rating IN ('liked', 'disliked')),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_feedback_user_created 
  ON public.user_feedback(user_id, created_at DESC);

-- RLS
ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own feedback"
  ON public.user_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);
