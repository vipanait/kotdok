<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

The rules above apply to `apps/web`, the Next.js site and API. `node_modules/next/dist/docs/` resolves from the repository root.

# Repository

npm workspaces: `apps/web` (Next.js), `apps/mobile` (Expo), `packages/contracts` and `packages/shared` (code both apps import). Migrations live in `supabase/`, plans and verification reports in `docs/`.

`packages/*` must stay portable: no Next.js, no server SDKs, no DOM.

The roadmap is `docs/mobile-api-plan.md`. Every stage has numbered acceptance criteria and needs a report under `docs/verification/`; a stage is not closed without one.
