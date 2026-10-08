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

/**
 * For the screens the app moves to by itself rather than because someone
 * tapped: the splash handing over to the pets or to sign-in, a sign-in
 * arriving at the pets, the consent a new account still owes.
 *
 * Sliding in, each of those looked like a step the person had taken, and a
 * sign-in through a provider played two or three of them in a row. A fade
 * reads as the same place settling instead.
 */
export const arrivalOptions = { animation: 'fade' } as const

/**
 * The routes an email link lands on while it is read. They appear at once
 * rather than fading over the screen the link interrupted: that screen may
 * already be changing underneath, and a fade showed both halfway.
 */
export const linkPendingOptions = { animation: 'none' } as const
