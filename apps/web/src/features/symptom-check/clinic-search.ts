/** A map search for clinics near the owner, in the site's language. */
export function clinicSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
