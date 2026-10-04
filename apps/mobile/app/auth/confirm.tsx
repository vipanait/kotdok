/**
 * Where `lapka://auth/confirm` lands while the link is being handled.
 *
 * The router shows the address it was opened with before the link handler in
 * the root layout has acted on it, and without a route that was «page not
 * found» — the whole time when the link changed nothing, because this phone
 * was already signed in. The handler always moves on from here (see
 * `useAuthLinks` in app/_layout.tsx); this screen only has to be blank.
 */
export { LinkPending as default } from '@/features/auth/LinkPending'
