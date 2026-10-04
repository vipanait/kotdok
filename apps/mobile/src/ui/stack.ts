import { colour } from './theme'

/**
 * How every stack in the app moves: a new screen slides in from the right and
 * back slides it away, with the edge swipe to go back.
 *
 * iOS does this by default; Android's default is a fade, which read as the
 * screen being replaced rather than stepped into. Set once here so the root
 * stack and the three tab stacks cannot drift apart.
 */
export const stackOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: colour.canvas },
  animation: 'slide_from_right',
  gestureEnabled: true,
} as const
