import { afterEach, expect, it, vi } from 'vitest'
import { makeSession } from '../fixtures'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

it('切换代理后真实 SDK 读取原会话并通过同源路径刷新令牌', async () => {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
  vi.stubEnv('VITE_SITE_URL', 'https://auth.water555.com')
  vi.stubEnv('VITE_SUPABASE_PROXY', 'true')
  vi.stubGlobal('BroadcastChannel', undefined)
  const session = makeSession()
  localStorage.setItem('sb-project-auth-token', JSON.stringify(session))
  localStorage.setItem('sb-project-auth-token-code-verifier', 'existing-pkce-verifier')
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    ...session,
    refresh_token: 'new-refresh-token',
  }), { status: 200, headers: { 'content-type': 'application/json' } }))
  vi.stubGlobal('fetch', fetch)
  const { getSupabase } = await import('../../src/lib/supabase')
  const client = getSupabase()
  try {
    const restored = await client.auth.getSession()
    expect(restored.error).toBeNull()
    expect(restored.data.session?.refresh_token).toBe(session.refresh_token)
    expect(fetch).not.toHaveBeenCalled()
    expect(localStorage.getItem('sb-project-auth-token-code-verifier')).toBe('existing-pkce-verifier')

    const refreshed = await client.auth.refreshSession()
    expect(refreshed.error).toBeNull()
    expect(fetch).toHaveBeenCalledOnce()
    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe(`${window.location.origin}/supabase/auth/v1/token?grant_type=refresh_token`)
    expect(options).toMatchObject({ method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }) })
    expect(JSON.parse(localStorage.getItem('sb-project-auth-token') || '{}').refresh_token).toBe('new-refresh-token')
    expect(client.storage.from('avatars').getPublicUrl('user/avatar.png').data.publicUrl)
      .toBe(`${window.location.origin}/supabase/storage/v1/object/public/avatars/user/avatar.png`)
  } finally {
    await client.auth.stopAutoRefresh()
  }
})
