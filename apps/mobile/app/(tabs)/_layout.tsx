import { Redirect, router } from 'expo-router'
import { Tabs } from 'expo-router/tabs'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import { PD_CONSENT_VERSION } from '@lapka/contracts'
import { consentSettled, consentSource, settleConsent } from '@/features/consent/consent-gate'
import { guardTabSwitch } from '@/features/unsaved/tab-guard'
import { openConsentScreen, setConsentRequiredHandler, withFreshSession } from '@/lib/api'
import { useAuth } from '@/providers/AuthProvider'
import { useSetLocale, useText } from '@/i18n'
import { Icon } from '@/ui/Icon'
import { colour, type } from '@/ui/theme'

/**
 * The three places the app goes: the pets, a check, and the account.
 *
 * Everything behind a sign-in lives here, and the guard is on the group rather
 * than repeated on each screen — a screen that forgets it would otherwise call
 * the API with no session and show its own error instead of the sign-in form.
 */
export default function TabsLayout() {
  const { session, loading, consentPending, setConsentPending, consentSettledFor, setConsentSettledFor } =
    useAuth()
  const userId = session?.user.id ?? null
  const t = useText()
  const setLocale = useSetLocale()

  /**
   * The account's language, asked for once on the way in.
   *
   * Until this answers, the interface speaks whatever the device does — which
   * is also what a brand-new account was created in, so the two usually agree.
   * A person who chose the other language gets it here rather than only after
   * visiting the profile.
   */
  useEffect(() => {
    if (!session) return
    void withFreshSession((api) => api.getMe())
      .then((me) => setLocale(me.locale))
      .catch(() => {})
  }, [session, setLocale])

  /**
   * Consent to personal data processing, settled once per signed-in user before
   * the tabs appear (stage 12): the consent ticked on registration is handed
   * over first, then a new account that still owes one goes to the consent
   * screen. Keyed on the user, not the session object, which a token refresh
   * replaces.
   */
  useEffect(() => {
    setConsentRequiredHandler(() => router.replace('/consent'))
  }, [])

  useEffect(() => {
    if (!userId) return
    let active = true
    void settleConsent({
      pending: consentPending,
      give: () =>
        withFreshSession((api) =>
          api.giveConsent({ version: PD_CONSENT_VERSION, source: consentSource(Platform.OS) }),
        ),
      status: () => withFreshSession((api) => api.getConsentStatus()),
    }).then((result) => {
      if (!active) return
      setConsentPending(false)
      // Through the same guard as a refused call, so a refusal arriving at the
      // same moment does not open the screen a second time.
      if (result === 'consent') openConsentScreen()
      else setConsentSettledFor(userId)
    })
    return () => {
      active = false
    }
    // The pending consent is read once, when the user arrives; later changes to
    // it belong to the next sign-in, so it is deliberately not a dependency.
  }, [userId])

  if (loading) return null
  if (!session) return <Redirect href="/sign-in" />
  if (!consentSettled(userId, consentSettledFor)) return null

  return (
    <Tabs
      screenListeners={({ navigation, route }) => ({
        // Another tab is about to take over and empty this one's stack. A form
        // with unsaved changes gets to ask first; pressing the tab already open
        // is a pop, which the form's screen stops by itself.
        tabPress: (event) => {
          if (navigation.isFocused()) return
          if (guardTabSwitch(() => navigation.navigate(route.name))) event.preventDefault()
        },
        /**
         * Empty this tab now that it has been left.
         *
         * `popToTopOnBlur` below only pops once the tab transition animation
         * reports that it finished, and a screen going somewhere else in the
         * same breath — «Новая проверка» on a result, «Проверить симптомы» on
         * an empty history — interrupts it. The profile then reopened two
         * screens deep, on a result read minutes ago.
         *
         * `POP_TO_TOP` is what `StackActions.popToTop()` builds; expo-router
         * does not re-export the helper.
         */
        blur: () => {
          const tab = navigation.getState()?.routes.find((open) => open.key === route.key)
          const stack = tab?.state
          if (stack?.type === 'stack' && stack.key && (stack.index ?? 0) > 0) {
            navigation.dispatch({ type: 'POP_TO_TOP', target: stack.key })
          }
        },
      })}
      screenOptions={{
        headerShown: false,
        // A tab opens where it starts. Kept depth made the profile tab reopen
        // on a result read from its history, with the profile itself a back
        // arrow or two away. Tapping the tab you are on already did this.
        popToTopOnBlur: true,
        sceneStyle: { backgroundColor: colour.canvas },
        tabBarActiveTintColor: colour.accent,
        tabBarInactiveTintColor: colour.faint,
        tabBarStyle: {
          backgroundColor: colour.surface,
          borderTopWidth: 1,
          borderTopColor: colour.line,
          paddingTop: 8,
        },
        tabBarLabelStyle: type.tab,
      }}
    >
      <Tabs.Screen
        name="pets"
        options={{
          title: t.tabs.pets,
          tabBarIcon: ({ color }) => <Icon name="paw" color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="check"
        options={{
          title: t.tabs.check,
          tabBarIcon: ({ color }) => <Icon name="checkup" color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t.tabs.profile,
          tabBarIcon: ({ color }) => <Icon name="profile" color={String(color)} />,
        }}
      />
    </Tabs>
  )
}
