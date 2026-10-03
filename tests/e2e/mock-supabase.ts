import type { Page, Route } from '@playwright/test'
import { makeSession, user } from '../fixtures'

export const testClient = {
  id: '33333333-3333-4333-8333-333333333333',
  name: '吾水阁测试应用',
  uri: 'https://client.example',
  logo_uri: '',
}
export const testAuthorization = {
  authorization_id: 'auth_123',
  redirect_uri: 'https://client.example/callback',
  client: testClient,
  user: { id: user.id, email: user.email },
  scope: 'openid profile email',
}
export type CapturedRequest = { url: string; path: string; method: string; body: Record<string, unknown> | null }
export type MockOptions = {
  signedIn?: boolean
  alreadyAuthorized?: boolean
  revokeFailure?: boolean
  expiredSession?: boolean
  partialEmailChange?: boolean
  invalidEmailLink?: boolean
  profileSaveFailure?: boolean
  profileSyncMismatch?: boolean
  requireReauthentication?: boolean
  unconfirmedLogin?: boolean
  legacyAvatar?: boolean
  expiredStoredSession?: boolean
  grantClient?: typeof testClient
}

/** Exercise the real browser SDK and UI while keeping tests independent of live accounts. */
export async function mockSupabase(page: Page, options: MockOptions = {}) {
  const requests: CapturedRequest[] = []
  let account = { ...user, user_metadata: { ...user.user_metadata } }
  if (options.legacyAvatar) account.user_metadata.avatar_url = `https://test-project.supabase.co/storage/v1/object/public/avatars/${user.id}/old.png`
  const session = makeSession(undefined, account)
  let grants = [{ client: options.grantClient || testClient, scopes: ['openid', 'profile'], granted_at: '2026-01-01T00:00:00.000Z' }]
  if (options.signedIn) {
    await page.addInitScript(({ savedSession }) => {
      if (!localStorage.getItem('water5-test-initialized')) {
        localStorage.setItem('sb-test-project-auth-token', JSON.stringify(savedSession))
        localStorage.setItem('water5-test-initialized', 'true')
      }
    }, { savedSession: options.expiredStoredSession ? makeSession(undefined, account, Math.floor(Date.now() / 1000) - 60) : session })
  }
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*', 'x-supabase-api-version': '2024-01-01', 'access-control-expose-headers': 'X-Supabase-Api-Version' },
    body: JSON.stringify(body),
  })
  // Any regression to a direct browser request must fail even when overseas.
  await page.route('https://test-project.supabase.co/**', route => route.abort('blockedbyclient'))
  await page.route('http://127.0.0.1:4173/supabase/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.slice('/supabase'.length)
    const method = request.method()
    let body: Record<string, unknown> | null = null
    try { body = request.postDataJSON() } catch { /* GET and DELETE do not carry JSON. */ }
    requests.push({ url: url.href, path, method, body })
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: {
      'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*',
    } })
    if (path === '/auth/v1/token') {
      if (options.unconfirmedLogin) return json(route, { code: 'email_not_confirmed', msg: 'Email not confirmed' }, 400)
      return json(route, session)
    }
    if (path === '/auth/v1/signup') return json(route, { ...account, identities: [{ id: account.id }] })
    if (path === '/auth/v1/verify') {
      if (options.invalidEmailLink) return json(route, { code: 'otp_expired', msg: 'Token has expired or is invalid' }, 403)
      return json(route, options.partialEmailChange ? { msg: 'Confirmation accepted. Please confirm the other email.', code: 'email_change_pending' } : session)
    }
    if (['/auth/v1/recover', '/auth/v1/resend', '/auth/v1/reauthenticate'].includes(path)) return json(route, {})
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } })
    if (path === '/auth/v1/user') {
      if (options.expiredSession) return json(route, { code: 'session_not_found', msg: 'Session not found' }, 401)
      if (method === 'PUT') {
        if (options.requireReauthentication && body?.password && !body.nonce) return json(route, { code: 'reauthentication_needed', msg: 'Reauthentication needed' }, 422)
        if (options.profileSaveFailure && body?.data) return json(route, { code: 'unexpected_failure', msg: 'Database error updating user' }, 500)
        if (body?.email) account = { ...account, new_email: String(body.email) }
        if (body?.data) account = { ...account, user_metadata: { ...account.user_metadata, ...(body.data as object) } }
      }
      return json(route, account)
    }
    if (path.startsWith('/storage/v1/object/public/avatars/')) return route.fulfill({
      contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=', 'base64'),
    })
    if (path.startsWith('/storage/v1/object/avatars/') && method === 'POST') return json(route, { Key: path.replace('/storage/v1/object/', ''), Id: 'avatar-object-id' })
    if (path === '/storage/v1/object/avatars' && method === 'DELETE') return json(route, [])
    if (path.startsWith('/rest/v1/profiles')) return json(route, {
      id: account.id, display_name: options.profileSyncMismatch ? user.user_metadata.display_name : account.user_metadata.display_name,
      avatar_url: account.user_metadata.avatar_url ?? null, updated_at: '2026-01-01T00:00:00.000Z',
    })
    if (path === '/auth/v1/oauth/authorizations/auth_123') {
      if (options.expiredSession) return json(route, { code: 'session_not_found', msg: 'Session not found' }, 401)
      return json(route, options.alreadyAuthorized ? { redirect_url: 'https://client.example/callback?code=existing&state=state123' } : testAuthorization)
    }
    if (path === '/auth/v1/oauth/authorizations/auth_123/consent') return json(route, {
      redirect_url: body?.action === 'deny'
        ? 'https://client.example/callback?error=access_denied&state=state123'
        : 'https://client.example/callback?code=approved&state=state123',
    })
    if (path === '/auth/v1/user/oauth/grants') {
      if (method === 'DELETE') {
        if (options.revokeFailure) return json(route, { code: 'unexpected_failure', msg: 'Unable to revoke grant' }, 500)
        grants = []
        return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } })
      }
      return json(route, grants)
    }
    return json(route, { message: `Unmocked request ${method} ${path}` }, 500)
  })
  await page.route('https://client.example/**', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>测试客户端回调</title><h1>测试客户端已收到授权结果</h1>',
  }))
  return { requests, session }
}
