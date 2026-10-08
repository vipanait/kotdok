import { BootScreen } from '@/ui/BootScreen'

/**
 * The splash's frame, for the moment an email link is handled.
 *
 * It used to be the bare canvas, which showed as a blank page between the
 * screen the link interrupted and the one it leads to. The wordmark is what
 * the app shows whenever it is getting ready, so a link reads as the app
 * opening rather than as something gone missing.
 */
export function LinkPending() {
  return <BootScreen />
}
