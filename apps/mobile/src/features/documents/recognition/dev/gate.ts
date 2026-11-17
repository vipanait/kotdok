/**
 * Whether the recognition states preview may open (ruling R1): only in a
 * development build. `__DEV__` is false in every build that leaves a
 * developer's machine — TestFlight, the stores, an EAS Update — so real users
 * never reach the fixtures; and outside React Native (the unit tests) it is
 * not defined at all, which counts as closed.
 */
export function devStatesEnabled(dev: boolean | undefined = typeof __DEV__ === 'undefined' ? undefined : __DEV__): boolean {
  return dev === true
}
