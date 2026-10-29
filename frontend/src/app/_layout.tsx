import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import { useColorScheme } from 'react-native';

import { SplashScreenController } from '@/components/splash-screen-controller';
import { Colors } from '@/constants/theme';
import { useAppFonts } from '@/hooks/use-app-fonts';
import { useAuthContext } from '@/hooks/use-auth-context';
import { AuthProvider } from '@/providers/auth-provider';

// Navigation chrome uses DESIGN.md paper/ink instead of plain white/black.
function navTheme(scheme: 'light' | 'dark'): Theme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const c = Colors[scheme];
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: c.ink,
      background: c.paper,
      card: c.surface,
      text: c.ink,
      border: c.line,
    },
  };
}

export default function RootLayout() {
  const colorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const fontsReady = useAppFonts();

  return (
    <ThemeProvider value={navTheme(colorScheme)}>
      <AuthProvider>
        <SplashScreenController fontsReady={fontsReady} />
        {fontsReady && <RootNavigator />}
      </AuthProvider>
    </ThemeProvider>
  );
}

// Client-side routing only. The real access boundary is RLS in Postgres
// (LostnFound.md §12); these guards just decide which screens to show.
//
//   session?  ──yes──▶ (app)            tabs: home, explore
//       └──────no───▶ sign-in ⇄ sign-up
function RootNavigator() {
  const { isLoggedIn } = useAuthContext();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isLoggedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Protected guard={!isLoggedIn}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
      </Stack.Protected>
    </Stack>
  );
}
