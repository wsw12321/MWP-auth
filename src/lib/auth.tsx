import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabase, supabase } from './supabase'
import { clearRecovery, establishRecovery as saveRecovery, isRecoverySession } from './recovery'
import { errorMessage } from './errors'

type AuthState = {
  session: Session | null
  user: Session['user'] | null
  loading: boolean
  recovery: boolean
  error: string | null
  signOut: () => Promise<void>
  finishRecovery: () => void
  establishRecovery: (session: Session) => void
}
const AuthContext = createContext<AuthState | null>(null)
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    let active = true
    let revision = 0
    const apply = (value: Session | null) => {
      setSession(value)
      const recovering = isRecoverySession(value)
      setRecovery(recovering)
      if (!recovering) clearRecovery()
      setLoading(false)
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, value) => {
      if (!active) return
      revision++
      if (event === 'PASSWORD_RECOVERY' && value) {
        try { saveRecovery(value) } catch (error) { setError(errorMessage(error)) }
      }
      apply(value)
    })
    const initialRevision = revision
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active || revision !== initialRevision) return
      if (error) setError(errorMessage(error))
      apply(data.session)
    }).catch(error => {
      if (active && revision === initialRevision) { setError(errorMessage(error)); apply(null) }
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])
  const signOut = useCallback(async () => {
    const { error } = await getSupabase().auth.signOut({ scope: 'local' })
    if (error) throw error
    clearRecovery()
    setRecovery(false)
    setSession(null)
  }, [])
  const finishRecovery = useCallback(() => { clearRecovery(); setRecovery(false) }, [])
  const establishRecovery = useCallback((value: Session) => {
    saveRecovery(value)
    setSession(value)
    setRecovery(true)
  }, [])
  const value = useMemo(() => ({ session, user: session?.user ?? null, loading, recovery, error, signOut, finishRecovery, establishRecovery }),
    [session, loading, recovery, error, signOut, finishRecovery, establishRecovery])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('AuthProvider is required')
  return context
}
