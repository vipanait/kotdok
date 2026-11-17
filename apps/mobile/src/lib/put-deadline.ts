/**
 * How long one file may take to reach storage: a photo of up to 5 MB or a
 * PDF of up to 10 MB on a slow line. The site gives a page the same
 * (`apps/web/.../upload-document.ts`, `PUT_TIMEOUT_MS`).
 */
export const PUT_TIMEOUT_MS = 120_000

/**
 * A PUT to a signed storage URL, given up after `timeoutMs`: a line that
 * stalls mid-file (a lift, a captive Wi-Fi) ends as a failed upload the
 * screen can offer again, not a spinner that never stops. False when it did
 * not land, for whatever reason.
 */
export async function putWithin(
  put: (signal: AbortSignal) => Promise<boolean>,
  timeoutMs: number = PUT_TIMEOUT_MS,
): Promise<boolean> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve(false)
    }, timeoutMs)
  })
  try {
    // The deadline wins even if the platform's fetch ignores the abort.
    return await Promise.race([put(controller.signal).catch(() => false), deadline])
  } finally {
    clearTimeout(timer)
  }
}
