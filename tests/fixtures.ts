import type { Session, User } from '@supabase/supabase-js'

export const user: User = {
  id: '11111111-1111-4111-8111-111111111111',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'water@example.com',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { display_name: '水友', name: '水友', full_name: '水友' },
  created_at: '2026-01-01T00:00:00.000Z',
  email_confirmed_at: '2026-01-01T00:00:00.000Z',
}

export function makeSession(
  sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  account: User = user,
  expiresAt = Math.floor(Date.now() / 1000) + 3600,
): Session {
  const encode = (value: object) => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
  return {
    access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: account.id, session_id: sessionId, exp: expiresAt, role: 'authenticated', aud: 'authenticated' })}.test-signature`,
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    user: account,
  }
}
