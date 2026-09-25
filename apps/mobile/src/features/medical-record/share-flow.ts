/** What sending the PDF needs from the phone, so the order of steps is tested without native modules. */
export type ShareDeps = {
  /** HTML to a PDF file; returns its location. */
  print(html: string): Promise<string>
  /** Gives the file its name; returns the new location. */
  rename(uri: string, fileName: string): Promise<string>
  /** The system sheet. Closing it without sending is not an error. */
  share(uri: string): Promise<void>
  remove(uri: string): void
}

/**
 * Print, name, hand to the system sheet, and delete the temporary file
 * whatever happened — the PDF holds the pet's medical history and is not
 * kept on the phone. A failure before the sheet opens is thrown, so the
 * screen can offer a retry.
 */
export async function sharePdf(html: string, fileName: string, deps: ShareDeps): Promise<void> {
  const printed = await deps.print(html)
  let current = printed
  try {
    current = await deps.rename(printed, fileName)
    await deps.share(current)
  } finally {
    try {
      deps.remove(current)
    } catch {
      // Already gone: nothing to clean.
    }
  }
}
