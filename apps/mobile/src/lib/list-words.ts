/** «блох, клещей и глистов»: commas, then the conjunction before the last. */
export function listWords(words: readonly string[], and: string): string {
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} ${and} ${words[words.length - 1]}`
}
