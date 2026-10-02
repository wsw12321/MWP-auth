import type { Session } from '@supabase/supabase-js'

const key = 'water5:password-recovery'
const lifetime = 60 * 60 * 1000
function identity(session: Session | null) {
  if (!session) return null
  try {
    const part = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(part))
    if (typeof claims.session_id !== 'string' || !claims.session_id) return null
    return { userId: session.user.id, sessionId: claims.session_id }
  } catch { return null }
}
// This is a UI gate, not a substitute for Supabase's server-side session validation.
export function establishRecovery(session: Session) {
  const value = identity(session)
  if (!value) throw new Error('恢复会话无效，请重新获取恢复邮件。')
  try { sessionStorage.setItem(key, JSON.stringify({ ...value, expires: Date.now() + lifetime })) }
  catch { throw new Error('浏览器未允许会话存储，请启用存储后重新打开恢复邮件。') }
}
export function clearRecovery() {
  try { sessionStorage.removeItem(key) } catch { /* A browser denying storage must still be able to sign out. */ }
}
export function sameAuthSession(first: Session | null, second: Session | null) {
  const a = identity(first)
  const b = identity(second)
  return Boolean(a && b && a.userId === b.userId && a.sessionId === b.sessionId)
}
export function isRecoverySession(session: Session | null) {
  try {
    const expected = identity(session)
    const saved = JSON.parse(sessionStorage.getItem(key) || 'null')
    return Boolean(expected && saved && saved.expires > Date.now()
      && expected.userId === saved.userId && expected.sessionId === saved.sessionId)
  } catch { return false }
}
