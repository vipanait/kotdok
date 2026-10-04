/**
 * The visit form, opened from a result in this tab.
 *
 * Its home is the pet's stack, but pushing it there switched tabs, and back
 * then landed on the pet list instead of the result it was opened from. The
 * pet arrives as `?id=` here, the same name the pet's own route gives it.
 */
export { default } from '../pets/[id]/visit-form'
