# Lapka

AI-powered symptom checker for cats at [lapka.my](https://lapka.my). Users describe their cat's symptoms and receive an urgency assessment: observe at home, visit a vet, or seek emergency care.

## Tech stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript 5**
- **Tailwind CSS 4**
- **Supabase** — auth + database
- **OpenAI API** — symptom analysis
- **Resend** — transactional email

## Prerequisites

- Node.js 20+
- Supabase project
- OpenAI API key
- Resend API key

## Environment setup

```bash
cp .env.test .env.local
```

Fill in the real values:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `OPENAI_API_KEY` | OpenAI API key |
| `NEXT_PUBLIC_APP_URL` | Public app URL (e.g. `https://lapka.my`) |
| `APP_BASE_URL` | Server-side app base URL |

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run test` | Run tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |

## Project structure

```
src/
  features/
    cats/           # Cat profiles
    symptom-check/  # AI symptom assessment flow
    auth/           # Authentication
    billing/        # Subscriptions and payments
    dashboard/      # User dashboard
    admin/          # Admin panel
  server/           # Server-side utilities and API logic
supabase/
  migrations/       # Database migrations (apply with Supabase CLI)
```

## Database

Migrations live in `supabase/migrations/`. Apply them with the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase db push
```
