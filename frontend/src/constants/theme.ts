/**
 * Design tokens. Source of truth: /DESIGN.md. Change DESIGN.md first, then here.
 *
 * Color only ever carries meaning: `action` (orange) = needs you,
 * `confirm` (green) = verified/approved. Everything else is ink and paper.
 */

import '@/global.css';

import { Platform, type TextStyle } from 'react-native';

const palette = {
  light: {
    paper: '#F7F5F0',
    surface: '#FFFFFF',
    ink: '#15181B',
    onInk: '#FFFFFF',
    muted: '#5E646B',
    line: '#E3DED4',
    action: '#E87500', // UTD Orange. Fill with ink text; never orange text on paper.
    actionSoft: '#FCEBD9',
    confirm: '#154734', // UTD Green
    confirmSoft: '#DCEBE3',
    error: '#B42318',
    warning: '#9A5B00',
    info: '#1F4FB8',
  },
  dark: {
    paper: '#0F1113',
    surface: '#191C1F',
    ink: '#F2EFE8',
    onInk: '#0F1113',
    muted: '#A3A8AD',
    line: '#2A2E33',
    action: '#F28A2A',
    actionSoft: '#3A2615',
    confirm: '#5FBF8F',
    confirmSoft: '#15291F',
    error: '#F0706A',
    warning: '#E0A43A',
    info: '#7FA6F5',
  },
} as const;

// The Expo scaffold's names are kept as aliases so existing components keep
// working; new code should use the DESIGN.md names above.
export const Colors = {
  light: {
    ...palette.light,
    text: palette.light.ink,
    background: palette.light.paper,
    backgroundElement: palette.light.surface,
    backgroundSelected: palette.light.line,
    textSecondary: palette.light.muted,
  },
  dark: {
    ...palette.dark,
    text: palette.dark.ink,
    background: palette.dark.paper,
    backgroundElement: palette.dark.surface,
    backgroundSelected: palette.dark.line,
    textSecondary: palette.dark.muted,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

// Font family names registered by useAppFonts() (src/hooks/use-app-fonts.ts).
// Each weight is its own family on native, so pick the family, not fontWeight.
export const Fonts = {
  display: 'SchibstedGrotesk_700Bold',
  displaySemi: 'SchibstedGrotesk_600SemiBold',
  displayHeavy: 'SchibstedGrotesk_800ExtraBold',
  sans: 'InstrumentSans_400Regular',
  sansMedium: 'InstrumentSans_500Medium',
  sansSemi: 'InstrumentSans_600SemiBold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

// DESIGN.md type scale (pt).
export const Type = {
  display: { fontFamily: Fonts.display, fontSize: 34, lineHeight: 38, letterSpacing: -0.5 },
  title: { fontFamily: Fonts.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.4 },
  headline: { fontFamily: Fonts.displaySemi, fontSize: 22, lineHeight: 28 },
  body: { fontFamily: Fonts.sans, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: Fonts.sansSemi, fontSize: 16, lineHeight: 24 },
  callout: { fontFamily: Fonts.sansMedium, fontSize: 14, lineHeight: 20 },
  meta: { fontFamily: Fonts.mono, fontSize: 12, lineHeight: 18 },
  label: {
    fontFamily: Fonts.monoMedium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
} as const satisfies Record<string, TextStyle>;

// DESIGN.md spacing scale (4pt base).
export const Space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const Radius = {
  sm: 6, // thumbnails
  md: 10, // inputs, tag cards
  lg: 16, // status cards, hero photo
  button: 14,
  full: 999, // chips, badges
} as const;

export const MinTouchTarget = 48;
export const ButtonHeight = 52;

// Legacy scaffold spacing, still used by the Expo template screens.
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
