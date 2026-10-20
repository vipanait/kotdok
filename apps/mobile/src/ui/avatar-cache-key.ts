/**
 * One photo, one cache entry (PR #82 review). Every read of the pets signs a
 * new link to the same file, so the link itself would download the photo
 * again — the avatar blinking out on each return to the list, and an expired
 * link in the cache showing nothing. The link without its query is the
 * file's path, which changes only when the photo is replaced.
 */
export function avatarCacheKey(uri: string): string {
  const query = uri.indexOf('?')
  return query === -1 ? uri : uri.slice(0, query)
}
