/** What sending the PDF needs from the phone, so the order of steps is tested without native modules. */
export type ShareDeps = {
  /** HTML to a PDF file; returns its location. */
  print(html: string): Promise<string>
  /** Gives the file its name; returns the new location. */
  rename(uri: string, fileName: string): Promise<string>
  /** The system sheet. Closing it without sending is not an error. */
  share(uri: string): Promise<void>
  remove(uri: string): void
  /** Deletes what earlier sends left behind. */
  sweep(): void
  /**
   * Android answers as soon as the receiving app opens its own screen, before
   * it has read the file: there the file stays until the next send sweeps it.
   */
  keepAfterShare: boolean
}

/**
 * Print, name, hand to the system sheet, and delete the temporary file — the
 * PDF holds the pet's medical history and is not kept on the phone longer
 * than sending needs. A failure before the sheet opens is thrown, so the
 * screen can offer a retry.
 */
export async function sharePdf(html: string, fileName: string, deps: ShareDeps): Promise<void> {
  try {
    deps.sweep()
  } catch {
    // Nothing left over, or it could not be read: the new file is named apart anyway.
  }
  const printed = await deps.print(html)
  let current = printed
  let shared = false
  try {
    current = await deps.rename(printed, fileName)
    await deps.share(current)
    shared = true
  } finally {
    if (!shared || !deps.keepAfterShare) {
      try {
        deps.remove(current)
      } catch {
        // Already gone: nothing to clean.
      }
    }
  }
}
