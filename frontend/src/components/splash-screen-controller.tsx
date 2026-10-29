import { SplashScreen } from 'expo-router'

import { useAuthContext } from '@/hooks/use-auth-context'

SplashScreen.preventAutoHideAsync()

// Keeps the native splash up until we know whether a session exists and the
// fonts are ready, so the user never sees a flash of the sign-in screen or of
// system fonts on launch.
export function SplashScreenController({ fontsReady }: { fontsReady: boolean }) {
  const { isLoading } = useAuthContext()

  if (!isLoading && fontsReady) {
    SplashScreen.hide()
  }

  return null
}
