# lapka.my

AI-powered symptom checker for cats.

## Tech stack

- **Next.js 16** · **React 19** · **TypeScript**
- **Tailwind CSS v4**
- **Supabase** — auth & database
- **OpenAI** — AI symptom analysis
- **Resend** — transactional email
- **Recharts** — health history charts

## Features

- AI symptom check — describe symptoms, get a health assessment
- Cat profiles — manage multiple cats per account
- Health history — track past checks with charts
- Billing & pricing — subscription plans
- User cabinet — account management
- Admin panel — user and content management

## Getting started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- OpenAI API key
- Resend API key

### Environment variables

Create a `.env.local` file:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
RESEND_API_KEY=
```

### Install & run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
src/
  app/          # Next.js App Router pages and API routes
  features/     # Feature-scoped logic (symptom check, billing, etc.)
  components/   # Shared UI components
  server/       # Server-only utilities and DB helpers
supabase/
  migrations/   # SQL migration files
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run tests |
| `npm run test:coverage` | Run tests with coverage |

## Database

Migrations live in `supabase/migrations/`. Apply them via the Supabase CLI:

```bash
supabase db push
```
