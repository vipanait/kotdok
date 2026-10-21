/**
 * Copies text to the clipboard and says honestly whether it worked: «copied»
 * only once the browser took it. A refused or missing clipboard is a
 * failure — the page then leaves the text selected to copy by hand.
 */
export async function copyText(clipboard: Pick<Clipboard, 'writeText'> | undefined, text: string): Promise<'copied' | 'failed'> {
  if (!clipboard) return 'failed'
  try {
    await clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}
