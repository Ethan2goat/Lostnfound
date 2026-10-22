import { createContext, use } from 'react'
import type { JwtPayload } from '@supabase/supabase-js'

import type { Tables } from '@/types/database'

export type Profile = Pick<Tables<'users'>, 'id' | 'username' | 'created_at'>

export type AuthData = {
  claims: JwtPayload | null
  profile: Profile | null
  isLoading: boolean
  isLoggedIn: boolean
}

export const AuthContext = createContext<AuthData | null>(null)

export function useAuthContext() {
  const value = use(AuthContext)
  if (!value) {
    throw new Error('useAuthContext must be used inside <AuthProvider />')
  }
  return value
}
