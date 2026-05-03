# lapka.my

Котики спасут мир.

AI-powered cat symptom checker and health cabinet.

## Tech stack

- **Next.js 16** · **React 19** · **TypeScript**
- **Tailwind CSS 4**
- **Supabase** — auth + database
- **OpenAI** — symptom analysis
- **Resend** — transactional email
- **Recharts** — health charts
- **Vitest** — unit/integration tests

## Features

- Symptom check flow with AI-generated health assessment
- Pet health cabinet (history, charts, records)
- Billing & subscriptions
- Admin panel

## Local development

**Prerequisites:** Node.js 20+, Supabase CLI

```bash
npm install
```

Copy `.env.local` and fill in the required variables:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_BASE_URL=http://localhost:3000
```

Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Test coverage report |

## Project structure

```
src/
  app/          # Next.js App Router pages and API routes
  features/     # Feature modules (auth, cabinet, symptom-check, billing…)
  components/   # Shared UI components
  server/       # Server-side services (auth, payments, AI, DB)
supabase/       # Migrations and Supabase config
```

## Testing

```bash
npm test
```

## Deployment

Deploy to [Vercel](https://vercel.com) — connect the repo, set the env vars, done.
