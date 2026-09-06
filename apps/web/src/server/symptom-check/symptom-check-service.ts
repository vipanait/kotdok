import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import OpenAI from 'openai'
import { createServiceClient } from '@/server/supabase/server'
import { getAuthUser } from '@/server/auth/get-auth-user'
import type { PetSpecies, SymptomCheckResult, Urgency } from '@/shared/types'
import { PAIN_SIGN_PROMPT_LABELS, sanitizePainSigns, type PainSign } from '@/shared/utils/check-params'
import { sanitizeSpecies } from '@/shared/utils/pet-utils'

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

async function getVetContext(symptoms: string, species: PetSpecies): Promise<string> {
  const supabase = createServiceClient()

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

export async function handleSymptomCheckRequest(request: NextRequest) {
  let reservedUsageLedgerId: string | null = null
  let supabaseForRefund: ReturnType<typeof createServiceClient> | null = null
  let userIdForRefund: string | null = null

  try {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    userIdForRefund = user.id

    const supabase = createServiceClient()
    supabaseForRefund = supabase

    // Credits check
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits, plan')
      .eq('id', user.id)
      .single()

    if (!profile || profile.credits <= 0) {
      return NextResponse.json({ error: 'Not enough credits / Недостаточно credits.' }, { status: 402 })
    }

    // Parse multipart (photo) or JSON (text only)
    let symptoms = ''
    let pet_id: string | null = null
    let appetite: string | null = null
    let activity: string | null = null
    let duration: string | null = null
    let stool: string | null = null
    let painSignsRaw: unknown = null
    const photoBase64List: { data: string; mimeType: string }[] = []

    const contentType = request.headers.get('content-type') ?? ''

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      symptoms = (formData.get('symptoms') as string) ?? ''
      pet_id = (formData.get('pet_id') as string) || (formData.get('cat_id') as string) || null
      appetite = (formData.get('appetite') as string) || null
      activity = (formData.get('activity') as string) || null
      duration = (formData.get('duration') as string) || null
      stool = (formData.get('stool') as string) || null
      painSignsRaw = formData.get('pain_signs')

      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
      const files = formData.getAll('photo') as File[]
      const validFiles = files.filter(f => f && f.size > 0).slice(0, 5)
      for (const file of validFiles) {
        if (file.size > 5 * 1024 * 1024) {
          return NextResponse.json({ error: 'Каждое фото должно быть до 5 МБ' }, { status: 400 })
        }
        if (!allowedMimes.includes(file.type)) {
          return NextResponse.json({ error: 'Допустимы только изображения (JPEG, PNG, WebP)' }, { status: 400 })
        }
        const buffer = await file.arrayBuffer()
        photoBase64List.push({ data: Buffer.from(buffer).toString('base64'), mimeType: file.type })
      }
    } else {
      const body = await request.json()
      symptoms = body.symptoms ?? ''
      pet_id = body.pet_id || body.cat_id || null
      appetite = body.appetite || null
      activity = body.activity || null
      duration = body.duration || null
      stool = body.stool || null
      painSignsRaw = body.pain_signs ?? null
    }

    symptoms = symptoms.slice(0, 2000)

    if (!symptoms || symptoms.trim().length < 3) {
      return NextResponse.json(
        { error: 'Опишите симптомы (минимум 3 символа)' },
        { status: 400 }
      )
    }

    // Validate quick params
    const validAppetite = ['normal', 'reduced', 'none']
    const validActivity = ['normal', 'low', 'lethargic']
    const validDuration = ['today', '2-3days', 'week+']
    const validStool = ['normal', 'loose', 'absent', 'bloody']
    if (appetite && !validAppetite.includes(appetite)) appetite = null
    if (activity && !validActivity.includes(activity)) activity = null
    if (duration && !validDuration.includes(duration)) duration = null
    if (stool && !validStool.includes(stool)) stool = null
    const pain_signs = sanitizePainSigns(painSignsRaw)

    // Pet profile context
    let petContext = ''
    let verifiedPetId: string | null = null
    let species: PetSpecies = 'cat'
    if (pet_id) {
      const { data: pet } = await supabase
        .from('pets').select('*').eq('id', pet_id).eq('user_id', user.id).is('deleted_at', null).single()
      if (!pet) return NextResponse.json({ error: 'Pet not found / Питомец не найден.' }, { status: 404 })

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
      p_user_id: user.id,
      p_symptom_check_id: null,
    })
    if (usageError) {
      const status = usageError.message.includes('insufficient_credits') ? 402 : 500
      return NextResponse.json({ error: usageError.message }, { status })
    }
    const reservedUsage = usage as { new_balance: number; ledger_id: string } | null
    reservedUsageLedgerId = reservedUsage?.ledger_id ?? null
    const newBalance = reservedUsage?.new_balance ?? profile.credits - 1

    // RAG search filtered by species
    const vetContext = await getVetContext(symptoms, species)
    const systemPrompt = systemPromptForSpecies(species).replace('{context}', vetContext)

    // Build user message — with or without photo
    type ContentPart =
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string; detail: 'high' } }

    const APPETITE_LABELS: Record<string, string> = { normal: 'eating normally', reduced: 'eating less than usual', none: 'not eating at all' }
    const ACTIVITY_LABELS: Record<string, string> = { normal: 'active and alert', low: 'less active than usual', lethargic: 'very lethargic' }
    const DURATION_LABELS: Record<string, string> = { today: 'started today', '2-3days': '2–3 days', 'week+': 'more than a week' }
    const STOOL_LABELS: Record<string, string> = { normal: 'normal stool', loose: 'loose/diarrhea', absent: 'no stool / constipation', bloody: 'blood in stool' }

    const painSignsText = pain_signs.length
      ? pain_signs.map(s => PAIN_SIGN_PROMPT_LABELS[s as PainSign] ?? s).join(', ')
      : null

    const quickContext = [
      appetite ? `Appetite: ${APPETITE_LABELS[appetite] ?? appetite}` : null,
      activity ? `Activity level: ${ACTIVITY_LABELS[activity] ?? activity}` : null,
      duration ? `Duration: symptoms have ${DURATION_LABELS[duration] ?? duration}` : null,
      stool ? `Stool: ${STOOL_LABELS[stool] ?? stool}` : null,
      painSignsText ? `Pain signs: ${painSignsText}` : null,
    ].filter(Boolean).join('. ')

    const speciesLabel = species === 'dog' ? 'Dog' : 'Cat'
    const userContent: ContentPart[] = [
      { type: 'text', text: `${speciesLabel} symptoms: ${symptoms}${quickContext ? `\n\nQuick assessment: ${quickContext}.` : ''}${petContext}` },
    ]

    for (const photo of photoBase64List) {
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
    if (!resultText) throw new Error('Empty response from GPT-4o')

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
        user_id: user.id,
        pet_id: verifiedPetId,
        symptoms_input: symptoms,
        urgency: result.urgency,
        urgency_reason: result.urgency_reason,
        possible_causes: result.possible_causes,
        species_specific_warning: result.species_specific_warning,
        home_care_steps: result.home_care_steps,
        vet_questions: result.vet_questions,
        full_response: { ...result, appetite, activity, duration, stool, pain_signs, photo_count: photoBase64List.length },
      })
      .select('id')
      .single()
    if (checkError || !check) throw new Error(checkError?.message ?? 'symptom_check_save_failed')

    if (reservedUsageLedgerId) {
      const { error: ledgerError } = await supabase
        .from('credit_ledger')
        .update({ symptom_check_id: check.id })
        .eq('id', reservedUsageLedgerId)
        .eq('user_id', user.id)
        .eq('reason', 'usage')
      if (ledgerError) console.error('usage ledger attach error:', ledgerError)
    }
    reservedUsageLedgerId = null

    revalidatePath('/dashboard')

    return NextResponse.json({
      ...result,
      has_photo: photoBase64List.length > 0,
      appetite,
      activity,
      duration,
      stool,
      pain_signs,
      check_id: check?.id,
      credits_remaining: newBalance,
    })
  } catch (error) {
    console.error('symptom-check error:', error)
    if (reservedUsageLedgerId && supabaseForRefund && userIdForRefund) {
      const { error: refundError } = await supabaseForRefund.rpc('refund_symptom_check_usage', {
        p_user_id: userIdForRefund,
        p_usage_ledger_id: reservedUsageLedgerId,
      })
      if (refundError) console.error('symptom-check credit refund error:', refundError)
    }
    return NextResponse.json({ error: 'An error occurred / Произошла ошибка.' }, { status: 500 })
  }
}
