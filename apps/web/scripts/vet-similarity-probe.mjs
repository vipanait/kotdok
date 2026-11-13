/**
 * How similar the vet knowledge base finds typical complaints and off-topic
 * questions (SRC-01, criterion 12): the numbers the context threshold
 * `VET_CONTEXT_MIN_SIMILARITY` (src/server/symptom-check/vet-sources.ts) is
 * chosen from.
 *
 * Read only: one embedding per query (`text-embedding-3-small`, as the
 * analysis) and the same `search_vet_knowledge` call the analysis makes, five
 * matches filtered by species. Prints a Markdown table for the report. The
 * corpus lives in production, and the search is open to the service role only,
 * so this runs with the owner's keys:
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… OPENAI_API_KEY=… \
 *     node apps/web/scripts/vet-similarity-probe.mjs [--queries file.json]
 *
 *   node apps/web/scripts/vet-similarity-probe.mjs --dry-run   # the queries, no network
 *
 * The queries are made up for the probe; no user's text goes into it.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const queriesFlag = args.indexOf('--queries')
const queriesPath =
  queriesFlag === -1
    ? join(dirname(fileURLToPath(import.meta.url)), 'vet-similarity-queries.json')
    : args[queriesFlag + 1]

const queries = JSON.parse(readFileSync(queriesPath, 'utf8'))

if (dryRun) {
  for (const query of queries) console.log(`${query.kind}\t${query.species}\t${query.text}`)
  console.log(`\n${queries.length} queries; nothing sent.`)
  process.exit(0)
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
  console.error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and OPENAI_API_KEY.')
  process.exit(1)
}

async function embed(text) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { authorization: `Bearer ${OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  })
  if (!response.ok) throw new Error(`embedding: ${response.status}`)
  return (await response.json()).data[0].embedding
}

async function search(embedding, species) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/search_vet_knowledge`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query_embedding: embedding, match_count: 5, filter_species: species }),
  })
  if (!response.ok) throw new Error(`search: ${response.status}`)
  return response.json()
}

const cell = (text) => String(text).replaceAll('|', '\\|')

console.log('| Вид запроса | Вид | Запрос | Сходство 1…5 | Лучший материал |')
console.log('| --- | --- | --- | --- | --- |')
for (const query of queries) {
  const rows = await search(await embed(query.text), query.species)
  const scores = rows.map((row) => row.similarity.toFixed(3)).join(' · ')
  console.log(
    `| ${query.kind} | ${query.species} | ${cell(query.text)} | ${scores} | ${cell(rows[0]?.source_title ?? '—')} |`,
  )
}
