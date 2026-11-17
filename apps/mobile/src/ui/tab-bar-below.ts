import { createContext, useContext } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * Whether the tab bar sits under the screen.
 *
 * The tab bar takes the home indicator's height itself, so a screen inside the
 * tabs can put its dock right on the bar. A screen outside them (the intro,
 * consent, account deletion) has nothing under its dock but the indicator,
 * and has to keep the dock clear of it on its own. The router does not say
 * which case a screen is in, so the tabs' layout says it.
 */
export const TabBarBelow = createContext(false)

/**
 * The room a screen's dock leaves under itself for the home indicator: none
 * above the tab bar, the bottom inset without one.
 */
export function useDockClearance(): number {
  const tabBarBelow = useContext(TabBarBelow)
  const bottomInset = useSafeAreaInsets().bottom
  return tabBarBelow ? 0 : bottomInset
}
