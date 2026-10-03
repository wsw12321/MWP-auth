// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker, { type Env } from '../../worker/index'

const upstream = 'https://uuwucstroazapvrmnprx.supabase.co'
const site = 'https://auth.water555.com'
const env: Env = {
  ASSETS: { fetch: vi.fn(async () => new Response('<html>account</html>', { headers: { 'Content-Type': 'text/html' } })) },
  SUPABASE_ORIGIN: upstream,
}
const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(new Response('{}', { headers: { 'Content-Type': 'application/json' } }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function call(path: string, init?: RequestInit, config = env) {
  return worker.fetch(new Request(site + path, init), config)
}

describe('same-origin Supabase proxy', () => {
  it('forwards the login method, query, body and SDK credentials once, without site cookies or spoofed IP headers', async () => {
    const body = JSON.stringify({ email: 'person@example.com', password: 'test-secret' })
    const result = await call('/supabase/auth/v1/token?grant_type=password&redirect_to=https%3A%2F%2Fapp.example%2Fcb', {
      method: 'POST', body,
      headers: {
        apikey: 'publishable-key', Authorization: 'Bearer user-token',
        'Content-Type': 'application/json', 'X-Client-Info': 'supabase-js/test',
        'X-Supabase-Api-Version': '2024-01-01',
        Cookie: 'account=private', Origin: site, Referer: site + '/login',
        'X-Forwarded-For': '1.2.3.4', Forwarded: 'for=1.2.3.4',
        'CF-Connecting-IP': '1.2.3.4', 'True-Client-IP': '1.2.3.4', Host: 'evil.example',
      },
    })
    expect(result.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe(upstream + '/auth/v1/token?grant_type=password&redirect_to=https%3A%2F%2Fapp.example%2Fcb')
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual', cache: 'no-store' })
    expect(await new Response(init?.body).text()).toBe(body)
    const headers = new Headers(init?.headers)
    expect(Object.fromEntries(headers)).toEqual({
      apikey: 'publishable-key', authorization: 'Bearer user-token',
      'content-type': 'application/json', 'x-client-info': 'supabase-js/test',
      'x-supabase-api-version': '2024-01-01',
    })
  })

  it('preserves REST query, schema and representation headers and authorization errors', async () => {
    const error = JSON.stringify({ code: 'PGRST301', message: 'JWT expired' })
    fetchMock.mockResolvedValueOnce(new Response(error, {
      status: 401, headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer error="invalid_token"' },
    }))
    const response = await call('/supabase/rest/v1/profiles?id=eq.user-id&select=avatar_url', {
      method: 'PATCH', body: '{"display_name":"水友"}',
      headers: { 'Content-Type': 'application/json', 'Accept-Profile': 'public', 'Content-Profile': 'public', Prefer: 'return=representation' },
    })
    expect(String(fetchMock.mock.calls[0][0])).toBe(upstream + '/rest/v1/profiles?id=eq.user-id&select=avatar_url')
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('prefer')).toBe('return=representation')
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('content-profile')).toBe('public')
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer error="invalid_token"')
    expect(await response.text()).toBe(error)
  })

  it('streams avatar uploads and downloads without changing their bytes', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 255, 128])
    fetchMock.mockResolvedValueOnce(new Response(png, { headers: { 'Content-Type': 'image/png' } }))
    const response = await call('/supabase/storage/v1/object/avatars/user-id/avatar.png', {
      method: 'POST', body: png, headers: { 'Content-Type': 'image/png', 'X-Upsert': 'false', 'Cache-Control': 'max-age=3600' },
    })
    const init = fetchMock.mock.calls[0][1]
    expect(new Uint8Array(await new Response(init?.body).arrayBuffer())).toEqual(png)
    expect(new Headers(init?.headers).get('x-upsert')).toBe('false')
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(png)
  })

  it.each(['/login', '/assets/account.js', '/supabase-other'])('serves static requests through ASSETS: %s', async path => {
    const request = new Request(site + path)
    const response = await worker.fetch(request, env)
    expect(await response.text()).toContain('<html>')
    expect(env.ASSETS.fetch).toHaveBeenCalledWith(request)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    '/supabase', '/supabase/', '/supabase/admin', '/supabase/functions/v1/send',
    '/supabase/auth/v2/token', '/supabase/auth/v1//token',
    '/supabase/auth/v1/%252e%252e/admin', '/supabase/storage/v1/object/a%2Fb',
    '/supabase/auth/v1/%5cadmin', '/supabase/auth/v1/%00token', '/supabase/auth/v1/%ZZ',
    '/supabase/auth/v1/%2e%2e/admin',
  ])('rejects unknown or ambiguously encoded API paths as JSON: %s', async path => {
    const response = await call(path)
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toMatchObject({ code: 'not_found' })
    expect(env.ASSETS.fetch).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects unsupported HTTP methods without contacting the upstream', async () => {
    const response = await call('/supabase/auth/v1/token', { method: 'PROPFIND' })
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toContain('POST')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    'https://evil.example', upstream + '.evil.example', 'http://uuwucstroazapvrmnprx.supabase.co',
    upstream + '/auth', upstream + '?target=evil', upstream + ':8443',
    'https://user:password@uuwucstroazapvrmnprx.supabase.co', '',
  ])('refuses invalid upstream configuration: %s', async origin => {
    const response = await call('/supabase/auth/v1/token', undefined, { ...env, SUPABASE_ORIGIN: origin })
    expect(response.status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['/auth/v1/verify?token=one', site + '/supabase/auth/v1/verify?token=one'],
    [upstream + '/auth/v1/oauth/authorize?client_id=one', site + '/supabase/auth/v1/oauth/authorize?client_id=one'],
    ['../verify?token=one', site + '/supabase/auth/v1/verify?token=one'],
    ['?page=consent', site + '/supabase/auth/v1/oauth/authorize?page=consent'],
    [upstream + '/storage/v1/object/public/avatars/u/a.png', site + '/supabase/storage/v1/object/public/avatars/u/a.png'],
    ['https://app.example/callback?code=one', 'https://app.example/callback?code=one'],
    ['//provider.example/authorize', '//provider.example/authorize'],
    [upstream + '.evil.example/auth/v1/token', upstream + '.evil.example/auth/v1/token'],
    [upstream + '/other/path', upstream + '/other/path'],
  ])('returns manual redirects, rewriting only this project’s API locations: %s', async (location, expected) => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: location } }))
    const response = await call('/supabase/auth/v1/oauth/authorize?client_id=one', { headers: { Authorization: 'Bearer secret' } })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(expected)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][1]?.redirect).toBe('manual')
  })

  it('leaves the OIDC issuer and response JSON unchanged', async () => {
    const discovery = { issuer: upstream + '/auth/v1', authorization_endpoint: upstream + '/auth/v1/oauth/authorize' }
    fetchMock.mockResolvedValueOnce(Response.json(discovery))
    const response = await call('/supabase/auth/v1/.well-known/openid-configuration')
    expect(await response.json()).toEqual(discovery)
  })

  it('prevents browser and CDN caching and removes upstream cookies, CORS and hop-by-hop headers', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { headers: {
      'Cache-Control': 'public, max-age=3600', 'CDN-Cache-Control': 'public', 'Cloudflare-CDN-Cache-Control': 'public',
      'Set-Cookie': 'upstream-session=secret; Path=/', 'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': 'true', Age: '100',
      Connection: 'keep-alive, x-internal', 'Keep-Alive': 'timeout=5', 'X-Internal': 'private',
    } }))
    const response = await call('/supabase/auth/v1/user')
    for (const header of ['cache-control', 'cdn-cache-control', 'cloudflare-cdn-cache-control', 'surrogate-control']) {
      expect(response.headers.get(header)).toContain('no-store')
    }
    for (const header of ['set-cookie', 'access-control-allow-origin', 'access-control-allow-credentials', 'age', 'connection', 'keep-alive', 'x-internal']) {
      expect(response.headers.has(header)).toBe(false)
    }
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
  })

  it('returns a readable 502 without exposing secrets or retrying a failed write', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connection failed at ?token=secret-token password=secret-password'))
    const response = await call('/supabase/auth/v1/signup', { method: 'POST', body: '{"password":"secret-password"}' })
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ code: 'upstream_unavailable', message: expect.any(String) })
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('aborts an unavailable upstream after 15 seconds without retrying', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }))
    const pending = call('/supabase/auth/v1/token', { method: 'POST', body: '{}' })
    await vi.advanceTimersByTimeAsync(15_000)
    expect((await pending).status).toBe(502)
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
