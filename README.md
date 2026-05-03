# lapka.my

AI-powered cat symptom checker — describe your cat's symptoms and get an instant analysis.

## Tech stack

- **Next.js 16** / **React 19** / **TypeScript**
- **Tailwind CSS v4**
- **Supabase** — auth & database
- **OpenAI** — symptom analysis
- **Recharts** — dashboard charts

## Getting started

**Prerequisites:** Node.js 20+, a Supabase project, an OpenAI API key.

```bash
cp .env.example .env.local   # fill in the vars below
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server only) |
| `OPENAI_API_KEY` | OpenAI API key |
| `NEXT_PUBLIC_APP_URL` | Public base URL (e.g. `https://lapka.my`) |
| `APP_BASE_URL` | Server-side base URL (same value as above) |

## Project structure

```
src/
  app/
    (frontend)/   # Pages: landing, check flow, cats, cabinet, pricing, admin, legal
    (backend)/    # API route handlers
  features/       # Feature modules: auth, cats, symptom-check, dashboard, admin
  server/         # Server-side services (Supabase client, OpenAI, payments)
  shared/         # Shared UI components, i18n, utilities
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest unit tests |

## Deploy

Deploy like any standard Next.js app — Vercel, Fly.io, or a Node server with `npm run build && npm start`.
