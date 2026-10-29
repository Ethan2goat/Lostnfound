import { Link } from 'expo-router';
import { useState } from 'react';

import { AuthForm } from '@/components/auth-form';
import { ThemedText } from '@/components/themed-text';
import { supabase } from '@/lib/supabase';

export default function SignUp() {
  const [notice, setNotice] = useState<string | null>(null);

  // The .edu restriction is enforced server-side by the before-user-created
  // Auth Hook (LostnFound.md §12.8); its message comes back as error.message.
  const signUp = async (email: string, password: string) => {
    setNotice(null);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return error.message;

    // With email confirmation on, no session is returned until the link is
    // clicked. If confirmation is off, AuthProvider picks up the session.
    if (!data.session) {
      setNotice(`Check ${email} for a confirmation link, then sign in.`);
    }
    return null;
  };

  return (
    <AuthForm
      title="Create account"
      subtitle="Only utdallas.edu emails can join, so everyone here is a UTD student."
      submitLabel="Sign up"
      onSubmit={signUp}
      notice={notice}
      footer={
        <Link href="/sign-in" replace>
          <ThemedText type="linkPrimary">Already have an account? Sign in</ThemedText>
        </Link>
      }
    />
  );
}
