import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/server-auth'
import type { SymptomCheckResult, Urgency } from '@/types'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const SYSTEM_PROMPT = `You are a specialized feline health triage assistant.
You have deep knowledge of cat-specific diseases, physiology, and behavioral signs of illness.

CRITICAL RULES:
- You are NOT a veterinarian and cannot diagnose
- Always recommend professional vet consultation
- Cats hide pain — always err on the side of caution
- Age matters enormously: kitten (<1yr), adult (1-10yr), senior (10yr+)
- Breed predispositions are real: Persian → breathing, Maine Coon → HCM, etc.
- If a photo is provided, analyze visible symptoms (wounds, swelling, discharge, posture, coat condition, eye/ear appearance) alongside the text description

TRIAGE LEVELS:
EMERGENCY (go now): seizures, difficulty breathing, urinary blockage in male cats, collapse, suspected poisoning, trauma
URGENT (within 24h): not eating >24h, vomiting >3x, blood in urine/stool, hiding + lethargy combo, significant weight loss
MONITOR (watch 48h): single vomit, mild sneezing, slight appetite change
HOME CARE: minor wounds, mild hairball, normal grooming changes

OUTPUT FORMAT (always valid JSON, no markdown). All text fields must be in Russian.

{
  "urgency": "emergency|urgent|monitor|home_care",
  "urgency_reason": "одно предложение почему",
  "photo_observations": "что видно на фото, или null если фото нет",
  "possible_causes": ["причина 1", "причина 2", "причина 3"],
  "cat_specific_warning": "специфика для кошек или null",
  "home_care_steps": ["шаг 1", "шаг 2"],
  "vet_questions": ["вопрос 1", "вопрос 2"],
  "disclaimer": "КотДок — информационный инструмент. Не является ветеринарным диагнозом и не заменяет осмотр специалиста."
}

CONTEXT FROM VET DATABASE:
{context}`

async function getVetContext(symptoms: string): Promise<string> {
  const supabase = createServiceClient()

  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: symptoms,
  })
  const embedding = embeddingResponse.data[0].embedding

  const { data, error } = await supabase.rpc('search_vet_knowledge', {
    query_embedding: embedding,
    match_count: 5,
  })

  if (error || !data?.length) return 'No additional context available.'

  return data
    .filter((row: { similarity: number }) => row.similarity > 0.3)
    .map((row: { source_title: string; content: string }) =>
      `[${row.source_title}]\n${row.content}`
    )
    .join('\n\n---\n\n')
}

const VALID_URGENCY: Urgency[] = ['emergency', 'urgent', 'monitor', 'home_care']

function validateAIResponse(raw: unknown): SymptomCheckResult {
  if (typeof raw !== 'object' || raw === null) throw new Error('AI response is not an object')
  const r = raw as Record<string, unknown>
  if (!VALID_URGENCY.includes(r.urgency as Urgency)) throw new Error(`Invalid urgency: ${r.urgency}`)
  return {
    urgency: r.urgency as Urgency,
    urgency_reason: String(r.urgency_reason ?? ''),
    photo_observations: r.photo_observations ? String(r.photo_observations) : null,
    possible_causes: Array.isArray(r.possible_causes) ? r.possible_causes as string[] : [],
    cat_specific_warning: r.cat_specific_warning ? String(r.cat_specific_warning) : null,
    home_care_steps: Array.isArray(r.home_care_steps) ? r.home_care_steps as string[] : [],
    vet_questions: Array.isArray(r.vet_questions) ? r.vet_questions as string[] : [],
    disclaimer: String(r.disclaimer ?? 'КотДок — информационный инструмент. Не является ветеринарным диагнозом и не заменяет осмотр специалиста.'),
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServiceClient()

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
    let cat_id: string | null = null
    let appetite: string | null = null
    let activity: string | null = null
    let duration: string | null = null
    let stool: string | null = null
    let photoBase64: string | null = null
    let photoMimeType = 'image/jpeg'

    const contentType = request.headers.get('content-type') ?? ''

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      symptoms = (formData.get('symptoms') as string) ?? ''
      cat_id = (formData.get('cat_id') as string) || null
      appetite = (formData.get('appetite') as string) || null
      activity = (formData.get('activity') as string) || null
      duration = (formData.get('duration') as string) || null
      stool = (formData.get('stool') as string) || null

      const file = formData.get('photo') as File | null
      if (file && file.size > 0) {
        if (file.size > 10 * 1024 * 1024) {
          return NextResponse.json({ error: 'Фото должно быть до 10 МБ' }, { status: 400 })
        }
        const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
        if (!allowedMimes.includes(file.type)) {
          return NextResponse.json({ error: 'Допустимы только изображения (JPEG, PNG, WebP)' }, { status: 400 })
        }
        photoMimeType = file.type
        const buffer = await file.arrayBuffer()
        photoBase64 = Buffer.from(buffer).toString('base64')
      }
    } else {
      const body = await request.json()
      symptoms = body.symptoms ?? ''
      cat_id = body.cat_id || null
      appetite = body.appetite || null
      activity = body.activity || null
      duration = body.duration || null
      stool = body.stool || null
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

    // Cat profile context
    let catContext = ''
    if (cat_id) {
      const { data: cat } = await supabase
        .from('cats').select('*').eq('id', cat_id).eq('user_id', user.id).single()
      if (cat) {
        const parts = [
          cat.name,
          cat.breed ? `breed: ${cat.breed}` : null,
          cat.age_years != null ? `${cat.age_years} years old` : null,
          cat.sex || null,
          cat.neutered != null ? (cat.neutered ? 'neutered/spayed' : 'intact') : null,
          cat.indoor_outdoor ? `lifestyle: ${cat.indoor_outdoor}` : null,
          cat.diet ? `diet: ${cat.diet} food` : null,
          cat.vaccinated != null ? (cat.vaccinated ? 'vaccinated' : 'not vaccinated') : null,
          cat.allergies?.length ? `allergies: ${cat.allergies.join(', ')}` : null,
          cat.chronic_conditions?.length ? `chronic conditions: ${cat.chronic_conditions.join(', ')}` : null,
          cat.medications?.length ? `medications: ${cat.medications.join(', ')}` : null,
          cat.notes ? `additional notes: ${cat.notes}` : null,
        ].filter(Boolean)
        catContext = `\n\nCAT PROFILE: ${parts.join(', ')}`
      }
    }

    // RAG search
    const vetContext = await getVetContext(symptoms)
    const systemPrompt = SYSTEM_PROMPT.replace('{context}', vetContext)

    // Build user message — with or without photo
    type ContentPart =
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string; detail: 'high' } }

    const APPETITE_LABELS: Record<string, string> = { normal: 'eating normally', reduced: 'eating less than usual', none: 'not eating at all' }
    const ACTIVITY_LABELS: Record<string, string> = { normal: 'active and alert', low: 'less active than usual', lethargic: 'very lethargic' }
    const DURATION_LABELS: Record<string, string> = { today: 'started today', '2-3days': '2–3 days', 'week+': 'more than a week' }
    const STOOL_LABELS: Record<string, string> = { normal: 'normal stool', loose: 'loose/diarrhea', absent: 'no stool / constipation', bloody: 'blood in stool' }

    const quickContext = [
      appetite ? `Appetite: ${APPETITE_LABELS[appetite] ?? appetite}` : null,
      activity ? `Activity level: ${ACTIVITY_LABELS[activity] ?? activity}` : null,
      duration ? `Duration: symptoms have ${DURATION_LABELS[duration] ?? duration}` : null,
      stool ? `Stool: ${STOOL_LABELS[stool] ?? stool}` : null,
    ].filter(Boolean).join('. ')

    const userContent: ContentPart[] = [
      { type: 'text', text: `Cat symptoms: ${symptoms}${quickContext ? `\n\nQuick assessment: ${quickContext}.` : ''}${catContext}` },
    ]

    if (photoBase64) {
      userContent.push({
        type: 'image_url',
        image_url: {
          url: `data:${photoMimeType};base64,${photoBase64}`,
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

    // Deduct credit
    const { error: creditError } = await supabase
      .from('profiles')
      .update({ credits: profile.credits - 1 })
      .eq('id', user.id)
    if (creditError) throw new Error('Failed to deduct credit')
    await supabase.from('credit_transactions').insert({ user_id: user.id, amount: -1, type: 'usage' })

    // Save to history
    const { data: check } = await supabase
      .from('symptom_checks')
      .insert({
        user_id: user.id,
        cat_id: cat_id || null,
        symptoms_input: symptoms,
        urgency: result.urgency,
        urgency_reason: result.urgency_reason,
        possible_causes: result.possible_causes,
        cat_specific_warning: result.cat_specific_warning,
        home_care_steps: result.home_care_steps,
        vet_questions: result.vet_questions,
        full_response: { ...result, appetite, activity, duration, stool },
      })
      .select('id')
      .single()

    return NextResponse.json({
      ...result,
      has_photo: !!photoBase64,
      appetite,
      activity,
      duration,
      stool,
      check_id: check?.id,
      credits_remaining: profile.credits - 1,
    })
  } catch (error) {
    console.error('symptom-check error:', error)
    return NextResponse.json({ error: 'An error occurred / Произошла ошибка.' }, { status: 500 })
  }
}
