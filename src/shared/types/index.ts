export type Urgency = 'emergency' | 'urgent' | 'monitor' | 'home_care' | 'healthy'
export type UserRole = 'user' | 'admin'

export interface SymptomCheckResult {
  urgency: Urgency
  urgency_reason: string
  photo_observations: string | null
  possible_causes: string[]
  cat_specific_warning: string | null
  additional_cat_info_needed: string[]
  home_care_steps: string[]
  vet_questions: string[]
  disclaimer: string
  has_photo?: boolean
  appetite?: string | null
  activity?: string | null
  duration?: string | null
  stool?: string | null
  pain_signs?: string[]
}

export interface Cat {
  id: string
  user_id: string
  name: string
  breed: string | null
  age_years: number | null
  weight_kg: number | null
  sex: 'male' | 'female' | null
  neutered: boolean | null
  indoor_outdoor: 'indoor' | 'outdoor' | 'both' | null
  diet: 'dry' | 'wet' | 'mixed' | 'raw' | null
  allergies: string[]
  vaccinated: boolean | null
  chronic_conditions: string[]
  medications: string[]
  notes: string | null
  created_at: string
}

export interface CatLatestCheck {
  urgency: string
  created_at: string
}

export interface Profile {
  id: string
  credits: number
  plan: 'free' | 'credits' | 'monthly' | 'pro'
  role: UserRole
  created_at: string
  feedback_submitted_at: string | null
}

export type FeedbackRating = 'liked' | 'disliked'
