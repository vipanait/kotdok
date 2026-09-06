import 'server-only'

import OpenAI from 'openai'
import type { ErrorCode } from '@lapka/contracts'
import type { createServiceClient } from '@/server/supabase/server'
import { loadAccount } from '@/server/auth/account-state'
import type { PetSpecies, SymptomCheckResult, Urgency } from '@/shared/types'
import { PAIN_SIGN_PROMPT_LABELS, type PainSign } from '@/shared/utils/check-params'
import { sanitizeSpecies } from '@/shared/utils/pet-utils'

type SupabaseService = ReturnType<typeof createServiceClient>

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const SHARED_OUTPUT = `OUTPUT FORMAT (always valid JSON, no markdown). All text fields must be in Russian.

{
  "urgency": "emergency|urgent|monitor|home_care|healthy",
  "urgency_reason": "одно предложение почему",
  "photo_observations": "что видно на фото, или null если фото нет",
  "possible_causes": ["причина 1", "причина 2", "причина 3"],
  "species_specific_warning": "видоспецифичное предупреждение или null",
  "additional_pet_info_needed": ["какой информации о питомце не хватает для более точной оценки"],
  "home_care_steps": ["шаг 1", "шаг 2"],
  "vet_questions": ["вопрос 1", "вопрос 2"],
  "disclaimer": "Лапка — информационный инструмент. Не является ветеринарным диагнозом и не заменяет осмотр специалиста."
}

CONTEXT FROM VET DATABASE:
{context}`

const CAT_SYSTEM_PROMPT = `You are a specialized feline health triage assistant.
You have deep knowledge of cat-specific diseases, physiology, and behavioral signs of illness.

CRITICAL RULES:
- You are NOT a veterinarian and cannot diagnose
- Always recommend professional vet consultation
- Cats hide pain — always err on the side of caution
- Age matters enormously: kitten (<1yr), adult (1-10yr), senior (10yr+)
- Breed predispositions are real: Persian → breathing, Maine Coon → HCM, etc.
- If a photo is provided, analyze visible symptoms (wounds, swelling, discharge, posture, coat condition, eye/ear appearance) alongside the text description
- Always identify what extra cat-specific information would make the triage more accurate. Prefer practical questions about missing age, weight, breed, sex/neutering, appetite, activity, stool/urination, duration, medications, chronic conditions, vaccination, lifestyle, diet, or photo details. If the provided cat profile and symptom description already contain enough context, return an empty array.

TRIAGE LEVELS:
EMERGENCY (go now): seizures, difficulty breathing, urinary blockage in male cats, collapse, suspected poisoning, trauma
URGENT (within 24h): not eating >24h, vomiting >3x, blood in urine/stool, hiding + lethargy combo, significant weight loss
MONITOR (watch 48h): single vomit, mild sneezing, slight appetite change
HOME CARE: minor wounds, mild hairball, normal grooming changes
HEALTHY (nothing to do): the described behavior is a normal feline trait or a one-off harmless event — e.g. seasonal shedding, purring while kneading, a single sneeze with no other signs, brief post-play panting, normal grooming, occasional zoomies. Use this ONLY when you are confident no action is needed and there are no red flags in the description, quick-assessment answers, photo, or cat profile. If there is any doubt, prefer MONITOR or HOME CARE.

For HEALTHY:
- home_care_steps should be empty or contain at most one short reassurance ("Продолжайте обычный уход").
- vet_questions should be an empty array.
- species_specific_warning should be null unless the breed/age genuinely changes the picture.

${SHARED_OUTPUT}`

const DOG_SYSTEM_PROMPT = `You are a specialized canine health triage assistant.
You have deep knowledge of dog-specific diseases, physiology, and behavioral signs of illness.

CRITICAL RULES:
- You are NOT a veterinarian and cannot diagnose
- Always recommend professional vet consultation
- Dogs may still mask discomfort — err on the side of caution when signs are unclear
- Age matters enormously: puppy (<1yr), adult (1-7yr), senior (7yr+; earlier for giant breeds)
- Breed predispositions are real: brachycephalic → breathing/heat risk, deep-chested → GDV/bloat, large/giant → orthopedic disease, etc.
- If a photo is provided, analyze visible symptoms (wounds, swelling, discharge, posture, coat condition, eye/ear appearance, abdomen distension) alongside the text description
- Always identify what extra dog-specific information would make the triage more accurate. Prefer practical questions about missing age, weight, breed, sex/neutering, appetite, activity, stool/urination, duration, medications, chronic conditions, vaccination, lifestyle, diet, or photo details. If the provided dog profile and symptom description already contain enough context, return an empty array.

TRIAGE LEVELS:
EMERGENCY (go now): seizures, difficulty breathing, suspected GDV/bloat (non-productive retching + distended abdomen), collapse, suspected poisoning (xylitol, chocolate, grapes, rodenticide), trauma, heatstroke, pale gums, continuous uncontrolled bleeding
URGENT (within 24h): not eating >24h, vomiting >3x, blood in urine/stool, marked lethargy, significant limp/pain, puppy with diarrhea/vomiting (parvo risk), sudden behavioral change with pain signs
MONITOR (watch 48h): single vomit, mild soft stool, slight appetite change, mild limping after play that improves
HOME CARE: minor scrapes, mild itch after known allergen exposure without distress, routine post-walk stiffness that resolves
HEALTHY (nothing to do): the described behavior is a normal canine trait or a one-off harmless event — e.g. occasional zoomies, brief panting after exercise that resolves, one sneeze with no other signs, normal shedding. Use this ONLY when you are confident no action is needed and there are no red flags. If there is any doubt, prefer MONITOR or HOME CARE.

For HEALTHY:
- home_care_steps should be empty or contain at most one short reassurance ("Продолжайте обычный уход").
- vet_questions should be an empty array.
- species_specific_warning should be null unless the breed/age genuinely changes the picture.

${SHARED_OUTPUT}`

function systemPromptForSpecies(species: PetSpecies): string {
  return species === 'dog' ? DOG_SYSTEM_PROMPT : CAT_SYSTEM_PROMPT
}

async function getVetContext(
  supabase: SupabaseService,
  symptoms: string,
  species: PetSpecies,
): Promise<string> {
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: symptoms,
  })
  const embedding = embeddingResponse.data[0].embedding

  const { data, error } = await supabase.rpc('search_vet_knowledge', {
    query_embedding: embedding,
    match_count: 5,
    filter_species: species,
  })

  if (error || !data?.length) return 'No additional context available.'

  return data
    .filter((row: { similarity: number }) => row.similarity > 0.3)
    .map((row: { source_title: string; content: string }) =>
      `[${row.source_title}]\n${row.content}`
    )
    .join('\n\n---\n\n')
}

const VALID_URGENCY: Urgency[] = ['emergency', 'urgent', 'monitor', 'home_care', 'healthy']

function pickString(r: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const val = r[key]
    if (val != null && String(val).trim()) return String(val)
  }
  return null
}

function pickStringArray(r: Record<string, unknown>, ...keys: string[]): string[] {
  for (const key of keys) {
    const val = r[key]
    if (Array.isArray(val)) return val.map(v => String(v))
  }
  return []
}

function validateAIResponse(raw: unknown): SymptomCheckResult {
  if (typeof raw !== 'object' || raw === null) throw new Error('AI response is not an object')
  const r = raw as Record<string, unknown>
  if (!VALID_URGENCY.includes(r.urgency as Urgency)) throw new Error(`Invalid urgency: ${r.urgency}`)
  return {
    urgency: r.urgency as Urgency,
    urgency_reason: String(r.urgency_reason ?? ''),
    photo_observations: r.photo_observations ? String(r.photo_observations) : null,
    possible_causes: Array.isArray(r.possible_causes) ? r.possible_causes as string[] : [],
    species_specific_warning: pickString(r, 'species_specific_warning', 'cat_specific_warning'),
    additional_pet_info_needed: pickStringArray(r, 'additional_pet_info_needed', 'additional_cat_info_needed'),
    home_care_steps: Array.isArray(r.home_care_steps) ? r.home_care_steps as string[] : [],
    vet_questions: Array.isArray(r.vet_questions) ? r.vet_questions as string[] : [],
    disclaimer: String(r.disclaimer ?? 'Лапка — информационный инструмент. Не является ветеринарным диагнозом и не заменяет осмотр специалиста.'),
  }
}


/** A photo already decoded by the HTTP adapter. */
export type AnalysisPhoto = { data: string; mimeType: string }

/** Quick-assessment answers, already narrowed to the allowed values. */
export type QuickAssessment = {
  appetite: string | null
  activity: string | null
  duration: string | null
  stool: string | null
  pain_signs: string[]
}

export type AnalyzeSymptomCheckInput = QuickAssessment & {
  userId: string
  symptoms: string
  petId: string | null
  photos: AnalysisPhoto[]
}

export type AnalyzeSymptomCheckSuccess = {
  ok: true
  result: SymptomCheckResult
  checkId: string
  creditsRemaining: number
  hasPhoto: boolean
  quickAssessment: QuickAssessment
}

export type AnalyzeSymptomCheckFailure = {
  ok: false
  /** The adapter turns this into a status; the message is passed through as-is. */
  code: ErrorCode
  message: string
}

export type AnalyzeSymptomCheckOutcome = AnalyzeSymptomCheckSuccess | AnalyzeSymptomCheckFailure

const APPETITE_LABELS: Record<string, string> = {
  normal: 'eating normally',
  reduced: 'eating less than usual',
  none: 'not eating at all',
}
const ACTIVITY_LABELS: Record<string, string> = {
  normal: 'active and alert',
  low: 'less active than usual',
  lethargic: 'very lethargic',
}
const DURATION_LABELS: Record<string, string> = {
  today: 'started today',
  '2-3days': '2–3 days',
  'week+': 'more than a week',
}
const STOOL_LABELS: Record<string, string> = {
  normal: 'normal stool',
  loose: 'loose/diarrhea',
  absent: 'no stool / constipation',
  bloody: 'blood in stool',
}

/**
 * Runs one analysis: checks the account, resolves the pet, reserves a credit,
 * asks the model, stores the result, and compensates the credit if anything
 * after the reservation fails.
 *
 * Takes a verified user id and already-parsed input, and returns plain data.
 * HTTP status codes, cookies and cache revalidation belong to the adapter.
 */
export async function analyzeSymptomCheck(
  supabase: SupabaseService,
  input: AnalyzeSymptomCheckInput,
): Promise<AnalyzeSymptomCheckOutcome> {
  let reservedUsageLedgerId: string | null = null

  const quickAssessment: QuickAssessment = {
    appetite: input.appetite,
    activity: input.activity,
    duration: input.duration,
    stool: input.stool,
    pain_signs: input.pain_signs,
  }

  try {
    const account = await loadAccount(supabase, input.userId)
    if (!account.ok) {
      // `not_found` keeps the response the route has always produced for a
      // missing profile; stage 2 gives the v1 routes their own codes.
      return account.reason === 'account_deleting'
        ? { ok: false, code: 'account_deleting', message: 'Account is being deleted.' }
        : { ok: false, code: 'insufficient_credits', message: 'Not enough credits / Недостаточно credits.' }
    }

    if (account.account.credits <= 0) {
      return {
        ok: false,
        code: 'insufficient_credits',
        message: 'Not enough credits / Недостаточно credits.',
      }
    }

    // Pet profile context
    let petContext = ''
    let verifiedPetId: string | null = null
    let species: PetSpecies = 'cat'
    if (input.petId) {
      const { data: pet } = await supabase
        .from('pets').select('*').eq('id', input.petId).eq('user_id', input.userId).is('deleted_at', null).single()
      if (!pet) return { ok: false, code: 'not_found', message: 'Pet not found / Питомец не найден.' }

      verifiedPetId = pet.id
      species = sanitizeSpecies(pet.species)
      const parts = [
        `species: ${species}`,
        pet.name,
        pet.breed ? `breed: ${pet.breed}` : null,
        pet.age_years != null ? `${pet.age_years} years old` : null,
        pet.sex || null,
        pet.neutered != null ? (pet.neutered ? 'neutered/spayed' : 'intact') : null,
        pet.indoor_outdoor ? `lifestyle: ${pet.indoor_outdoor}` : null,
        pet.diet ? `diet: ${pet.diet} food` : null,
        species === 'dog' && pet.size_class ? `size: ${pet.size_class}` : null,
        species === 'dog' && pet.walk_activity ? `walk activity: ${pet.walk_activity}` : null,
        pet.vaccinated != null ? (pet.vaccinated ? 'vaccinated' : 'not vaccinated') : null,
        pet.allergies?.length ? `allergies: ${pet.allergies.join(', ')}` : null,
        pet.chronic_conditions?.length ? `chronic conditions: ${pet.chronic_conditions.join(', ')}` : null,
        pet.medications?.length ? `medications: ${pet.medications.join(', ')}` : null,
        pet.notes ? `additional notes: ${pet.notes}` : null,
      ].filter(Boolean)
      petContext = `\n\nPET PROFILE: ${parts.join(', ')}`
    }

    // Reserve the credit before expensive external work. If anything below
    // fails, the catch block compensates it with refund_symptom_check_usage.
    const { data: usage, error: usageError } = await supabase.rpc('apply_symptom_check_usage', {
      p_user_id: input.userId,
      p_symptom_check_id: null,
    })
    if (usageError) {
      return {
        ok: false,
        code: usageError.message.includes('insufficient_credits') ? 'insufficient_credits' : 'internal_error',
        message: usageError.message,
      }
    }
    const reservedUsage = usage as { new_balance: number; ledger_id: string } | null
    reservedUsageLedgerId = reservedUsage?.ledger_id ?? null
    const newBalance = reservedUsage?.new_balance ?? account.account.credits - 1

    // RAG search filtered by species
    const vetContext = await getVetContext(supabase, input.symptoms, species)
    const systemPrompt = systemPromptForSpecies(species).replace('{context}', vetContext)

    // Build user message — with or without photo
    type ContentPart =
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string; detail: 'high' } }

    const painSignsText = input.pain_signs.length
      ? input.pain_signs.map(s => PAIN_SIGN_PROMPT_LABELS[s as PainSign] ?? s).join(', ')
      : null

    const quickContext = [
      input.appetite ? `Appetite: ${APPETITE_LABELS[input.appetite] ?? input.appetite}` : null,
      input.activity ? `Activity level: ${ACTIVITY_LABELS[input.activity] ?? input.activity}` : null,
      input.duration ? `Duration: symptoms have ${DURATION_LABELS[input.duration] ?? input.duration}` : null,
      input.stool ? `Stool: ${STOOL_LABELS[input.stool] ?? input.stool}` : null,
      painSignsText ? `Pain signs: ${painSignsText}` : null,
    ].filter(Boolean).join('. ')

    const speciesLabel = species === 'dog' ? 'Dog' : 'Cat'
    const userContent: ContentPart[] = [
      { type: 'text', text: `${speciesLabel} symptoms: ${input.symptoms}${quickContext ? `\n\nQuick assessment: ${quickContext}.` : ''}${petContext}` },
    ]

    for (const photo of input.photos) {
      userContent.push({
        type: 'image_url',
        image_url: {
          url: `data:${photo.mimeType};base64,${photo.data}`,
          detail: 'high',
        },
      })
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-5.4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
      max_completion_tokens: 1500,
    })

    const resultText = completion.choices[0].message.content
    if (!resultText) throw new Error('Empty response from the model')

    let parsed: unknown
    try {
      parsed = JSON.parse(resultText)
    } catch {
      throw new Error('AI returned invalid JSON')
    }
    const result = validateAIResponse(parsed)

    // Save check first so the ledger entry can reference it.
    const { data: check, error: checkError } = await supabase
      .from('symptom_checks')
      .insert({
        user_id: input.userId,
        pet_id: verifiedPetId,
        symptoms_input: input.symptoms,
        urgency: result.urgency,
        urgency_reason: result.urgency_reason,
        possible_causes: result.possible_causes,
        species_specific_warning: result.species_specific_warning,
        home_care_steps: result.home_care_steps,
        vet_questions: result.vet_questions,
        full_response: { ...result, ...quickAssessment, photo_count: input.photos.length },
      })
      .select('id')
      .single()
    if (checkError || !check) throw new Error(checkError?.message ?? 'symptom_check_save_failed')

    if (reservedUsageLedgerId) {
      const { error: ledgerError } = await supabase
        .from('credit_ledger')
        .update({ symptom_check_id: check.id })
        .eq('id', reservedUsageLedgerId)
        .eq('user_id', input.userId)
        .eq('reason', 'usage')
      if (ledgerError) console.error('usage ledger attach error:', ledgerError)
    }
    reservedUsageLedgerId = null

    return {
      ok: true,
      result,
      checkId: check.id,
      creditsRemaining: newBalance,
      hasPhoto: input.photos.length > 0,
      quickAssessment,
    }
  } catch (error) {
    console.error('symptom-check error:', error)
    if (reservedUsageLedgerId) {
      const { error: refundError } = await supabase.rpc('refund_symptom_check_usage', {
        p_user_id: input.userId,
        p_usage_ledger_id: reservedUsageLedgerId,
      })
      if (refundError) console.error('symptom-check credit refund error:', refundError)
    }
    return { ok: false, code: 'internal_error', message: 'An error occurred / Произошла ошибка.' }
  }
}
