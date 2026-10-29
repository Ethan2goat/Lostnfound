// Per-weight imports: the packages' root entry requires every weight's .ttf,
// which would bundle all of them into the app. Only DESIGN.md's weights ship.
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono/400Regular';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono/500Medium';
import { InstrumentSans_400Regular } from '@expo-google-fonts/instrument-sans/400Regular';
import { InstrumentSans_500Medium } from '@expo-google-fonts/instrument-sans/500Medium';
import { InstrumentSans_600SemiBold } from '@expo-google-fonts/instrument-sans/600SemiBold';
import { SchibstedGrotesk_600SemiBold } from '@expo-google-fonts/schibsted-grotesk/600SemiBold';
import { SchibstedGrotesk_700Bold } from '@expo-google-fonts/schibsted-grotesk/700Bold';
import { SchibstedGrotesk_800ExtraBold } from '@expo-google-fonts/schibsted-grotesk/800ExtraBold';
import { useFonts } from 'expo-font';

// Family names match Fonts in constants/theme.ts.
export function useAppFonts() {
  const [loaded, error] = useFonts({
    SchibstedGrotesk_600SemiBold,
    SchibstedGrotesk_700Bold,
    SchibstedGrotesk_800ExtraBold,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });

  if (error) {
    // Fall back to system fonts rather than blocking the app on a font error.
    console.warn('[fonts] failed to load, using system fonts', error.message);
  }

  return loaded || error != null;
}
