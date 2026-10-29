import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import {
  ButtonHeight,
  MaxContentWidth,
  MinTouchTarget,
  Radius,
  Space,
  Type,
} from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type AuthFormProps = {
  title: string;
  subtitle: string;
  submitLabel: string;
  // Resolves to an error message to show, or null on success.
  onSubmit: (email: string, password: string) => Promise<string | null>;
  notice?: string | null;
  footer: ReactNode;
};

// Shared by sign-in and sign-up so validation, loading and error display
// live in one place. Layout per DESIGN.md: answer-first copy at the top,
// primary action pinned at the bottom within thumb reach.
export function AuthForm({ title, subtitle, submitLabel, onSubmit, notice, footer }: AuthFormProps) {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return; // also guards double-taps while in flight
    setSubmitting(true);
    setError(null);
    try {
      setError(await onSubmit(email.trim().toLowerCase(), password));
    } catch {
      setError('Something went wrong. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = (field: 'email' | 'password') => [
    styles.input,
    {
      color: theme.ink,
      backgroundColor: theme.surface,
      borderColor: focused === field ? theme.ink : theme.line,
    },
  ];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.paper }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <ThemedText type="label">{'UT Dallas · Lost & Found'}</ThemedText>
            <ThemedText type="title">{title}</ThemedText>
            <ThemedText type="body" themeColor="muted">
              {subtitle}
            </ThemedText>
          </View>

          <View style={styles.fields}>
            <View style={styles.field}>
              <ThemedText type="smallBold">Email</ThemedText>
              <TextInput
                style={inputStyle('email')}
                placeholder="netid@utdallas.edu"
                placeholderTextColor={theme.muted}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused(null)}
                editable={!submitting}
                accessibilityLabel="Email"
              />
            </View>
            <View style={styles.field}>
              <ThemedText type="smallBold">Password</ThemedText>
              <TextInput
                style={inputStyle('password')}
                placeholder="Password"
                placeholderTextColor={theme.muted}
                secureTextEntry
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={handleSubmit}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
                editable={!submitting}
                accessibilityLabel="Password"
              />
            </View>
          </View>

          {error && (
            <ThemedText
              type="small"
              themeColor="error"
              accessibilityRole="alert"
              accessibilityLiveRegion="polite">
              {error}
            </ThemedText>
          )}

          {notice && !error && (
            <View
              style={[styles.notice, { backgroundColor: theme.confirmSoft }]}
              accessibilityLiveRegion="polite">
              <ThemedText type="small" themeColor="confirm">
                {notice}
              </ThemedText>
            </View>
          )}
        </ScrollView>

        <View style={styles.bottom}>
          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit, busy: submitting }}
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: theme.ink,
                opacity: !canSubmit ? 0.35 : pressed ? 0.85 : 1,
              },
            ]}>
            {submitting ? (
              <ActivityIndicator color={theme.onInk} />
            ) : (
              <ThemedText type="bodyStrong" themeColor="onInk">
                {submitLabel}
              </ThemedText>
            )}
          </Pressable>
          <View style={styles.footer}>{footer}</View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  scroll: {
    flexGrow: 1,
    gap: Space.xl,
    paddingHorizontal: Space.lg,
    paddingTop: Space.xxxl,
  },
  header: {
    gap: Space.sm,
  },
  fields: {
    gap: Space.lg,
  },
  field: {
    gap: Space.xs + 2,
  },
  input: {
    ...Type.body,
    minHeight: MinTouchTarget,
    paddingHorizontal: Space.md + 2,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    // The ink border is the focus indicator; drop the browser's blue ring on web.
    ...Platform.select({ web: { outlineWidth: 0 }, default: {} }),
  },
  notice: {
    padding: Space.md,
    borderRadius: Radius.md,
  },
  bottom: {
    paddingHorizontal: Space.lg,
    paddingTop: Space.md,
    paddingBottom: Space.lg,
    gap: Space.md,
  },
  button: {
    height: ButtonHeight,
    borderRadius: Radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    alignItems: 'center',
    minHeight: MinTouchTarget,
    justifyContent: 'center',
  },
});
