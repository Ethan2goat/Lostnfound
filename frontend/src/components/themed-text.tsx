import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// `display`/`headline`/`body`/`meta`/`label` are the DESIGN.md scale.
// The rest are the Expo scaffold's names, mapped onto that scale.
export type ThemedTextProps = TextProps & {
  type?:
    | 'display'
    | 'headline'
    | 'body'
    | 'bodyStrong'
    | 'meta'
    | 'label'
    | 'default'
    | 'title'
    | 'small'
    | 'smallBold'
    | 'subtitle'
    | 'link'
    | 'linkPrimary'
    | 'code';
  themeColor?: ThemeColor;
};

const defaultColor: Partial<Record<NonNullable<ThemedTextProps['type']>, ThemeColor>> = {
  meta: 'muted',
  label: 'muted',
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? defaultColor[type] ?? 'ink'] },
        styles[type],
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  display: Type.display,
  headline: Type.headline,
  body: Type.body,
  bodyStrong: Type.bodyStrong,
  meta: Type.meta,
  label: Type.label,
  default: Type.body,
  title: Type.display,
  subtitle: Type.title,
  small: Type.callout,
  smallBold: { ...Type.callout, fontFamily: Fonts.sansSemi },
  // Links are ink and underlined: color is reserved for meaning (DESIGN.md).
  link: { ...Type.callout, textDecorationLine: 'underline' },
  linkPrimary: { ...Type.callout, fontFamily: Fonts.sansSemi, textDecorationLine: 'underline' },
  code: Type.meta,
});
