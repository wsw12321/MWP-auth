import { getSupabase } from './supabase'

export type MailType = 'signup' | 'recovery' | 'email_change'
const pending = new Map<string, ReturnType<ReturnType<typeof getSupabase>['auth']['verifyOtp']>>()

/** One request per link, including React StrictMode's effect replay. No tokens persisted. */
export function verifyEmailLink(tokenHash: string, type: MailType) {
  const key = `${type}:${tokenHash}`
  let request = pending.get(key)
  if (!request) {
    request = getSupabase().auth.verifyOtp({ token_hash: tokenHash, type })
    pending.set(key, request)
    if (pending.size > 10) pending.delete(pending.keys().next().value!)
  }
  return request
}
