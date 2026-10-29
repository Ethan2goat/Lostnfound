import { useEffect, useState, type PropsWithChildren } from 'react'
import type { JwtPayload } from '@supabase/supabase-js'

import { AuthContext, type Profile } from '@/hooks/use-auth-context'
import { supabase } from '@/lib/supabase'

export function AuthProvider({ children }: PropsWithChildren) {
  const [claims, setClaims] = useState<JwtPayload | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // getClaims() instead of getSession()/getUser(): verifies the JWT locally,
  // no network round-trip just to check login state (devlog 11.4).
  // Awaiting it inside onAuthStateChange is safe on supabase-js >= 2.107
  // (devlog 11.3).
  useEffect(() => {
    const loadClaims = async () => {
      const { data } = await supabase.auth.getClaims()
      setClaims(data?.claims ?? null)
      setIsLoading(false)
    }

    loadClaims()

    const { data: subscription } = supabase.auth.onAuthStateChange(async () => {
      await loadClaims()
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  // Profile row is created by the handle_new_user trigger on signup.
  // Explicit column list so a future column-grant change fails loudly.
  useEffect(() => {
    const userId = claims?.sub
    if (!userId) {
      setProfile(null)
      return
    }

    let cancelled = false
    supabase
      .from('users')
      .select('id, username, created_at')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.warn('[auth] profile fetch failed', { userId, code: error.code })
        }
        setProfile(data ?? null)
      })

    return () => {
      cancelled = true
    }
  }, [claims?.sub])

  return (
    <AuthContext
      value={{
        claims,
        profile,
        isLoading,
        isLoggedIn: claims != null,
      }}>
      {children}
    </AuthContext>
  )
}
