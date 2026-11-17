/**
 * Whether the fixtures previews exist on this server: only when it runs
 * with `LAPKA_UI_FIXTURES=1` — never set on Vercel — and a 404 otherwise.
 * Read at request time (the page is dynamic), not baked in at build.
 */
export function uiFixturesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.LAPKA_UI_FIXTURES === '1'
}
