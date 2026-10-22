import { SplashScreen } from 'expo-router'

import { useAuthContext } from '@/hooks/use-auth-context'

SplashScreen.preventAutoHideAsync()

// Keeps the native splash up until we know whether a session exists, so the
// user never sees a flash of the sign-in screen on launch.
export function SplashScreenController() {
  const { isLoading } = useAuthContext()

  if (!isLoading) {
    SplashScreen.hide()
  }

  return null
}
