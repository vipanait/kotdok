import { useEffect, useRef, type ReactNode } from 'react'
import { AccessibilityInfo, Animated, Easing, useWindowDimensions } from 'react-native'

/**
 * A step of a form sliding in, the way a pushed screen does.
 *
 * For steps that live on one screen (the symptom check's two), so the move
 * between them reads as forward and back rather than as the page being
 * swapped. `from` is the side it comes from; null shows it in place, as on
 * first opening or after a draft is restored. Built on React Native's own
 * Animated: Reanimated is not linked into the store build.
 */
export function StepSlide({ from, children }: { from: 'left' | 'right' | null; children: ReactNode }) {
  const { width } = useWindowDimensions()
  const offset = useRef(new Animated.Value(from === 'right' ? width : from === 'left' ? -width : 0)).current

  useEffect(() => {
    if (!from) return
    let cancelled = false
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return
      if (reduce) {
        offset.setValue(0)
        return
      }
      Animated.timing(offset, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start()
    })
    return () => {
      cancelled = true
    }
    // Once, on the way in: the step is mounted anew for every move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <Animated.View style={{ transform: [{ translateX: offset }] }}>{children}</Animated.View>
}
