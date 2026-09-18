/**
 * The shortest password this project accepts.
 *
 * Supabase is what actually enforces it (`minimum_password_length` in
 * `supabase/config.toml`); this constant is how the forms stay in step, so a
 * password a form accepts is never one the server then calls weak.
 */
export const PASSWORD_MIN = 8
