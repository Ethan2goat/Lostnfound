import { Link } from 'expo-router';

import { AuthForm } from '@/components/auth-form';
import { ThemedText } from '@/components/themed-text';
import { supabase } from '@/lib/supabase';

export default function SignIn() {
  // On success, onAuthStateChange updates AuthProvider and Stack.Protected
  // swaps to the (app) group; no manual navigation needed.
  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return null;
    if (error.code === 'email_not_confirmed') {
      return 'Confirm your email first. Check your utdallas.edu inbox for the link.';
    }
    if (error.code === 'invalid_credentials') {
      return 'Wrong email or password.';
    }
    return error.message;
  };

  return (
    <AuthForm
      title="Sign in"
      subtitle="Use your utdallas.edu email and password."
      submitLabel="Sign in"
      onSubmit={signIn}
      footer={
        <Link href="/sign-up" replace>
          <ThemedText type="linkPrimary">New here? Create an account</ThemedText>
        </Link>
      }
    />
  );
}
