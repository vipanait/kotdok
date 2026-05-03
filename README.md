# lapka.my (kotdok)

Pet health web app. Lets owners check their cat's symptoms with an AI-powered checker, manage a cat cabinet with health history, and purchase subscription plans. Includes an admin panel for analytics and user management.

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Supabase** — auth, database, SSR helpers
- **OpenAI** — symptom checking
- **Recharts** — admin analytics charts
- **Vitest** — unit/integration tests

## Prerequisites

- Node.js 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for local DB)

## Local development

1. Copy environment variables (see below) into `.env.local`.
2. Start local Supabase:
   ```bash
   supabase start
   ```
3. Apply migrations:
   ```bash
   supabase db push
   ```
4. Run the dev server:
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm run test` | Run tests (Vitest) |
| `npm run test:watch` | Watch mode |
| `npm run test:coverage` | Coverage report |

## Environment variables

Create `.env.local` with the following keys:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# App URL (used for OAuth redirects and billing callbacks)
NEXT_PUBLIC_APP_URL=
APP_BASE_URL=          # optional override for server-side URL

# OpenAI
OPENAI_API_KEY=

# Payments (set to 'false' to use real payment provider)
ENABLE_DUMMY_PAYMENTS=true
DUMMY_WEBHOOK_SECRET=  # required in non-local environments when using dummy payments
```

## Project structure

```
src/
  app/           # Next.js App Router pages and API routes
    (frontend)/  # Public-facing pages (landing, auth, cabinet, symptom check)
    (backend)/   # API route handlers
    admin/       # Admin panel pages
  features/      # Feature modules (auth, billing, cats, symptom-check, admin, dashboard)
  components/    # Shared UI components
  server/        # Server-only utilities (Supabase clients, auth helpers, payments, AI)
  shared/        # Shared types, i18n dictionaries, utilities
supabase/
  migrations/    # SQL migrations — apply with `supabase db push`
```
