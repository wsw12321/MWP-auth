import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
  vi.stubEnv('VITE_SITE_URL', 'https://auth.water555.com')
  vi.stubEnv('VITE_SUPABASE_PROXY', undefined)
  vi.stubEnv('PROD', true)
})
afterEach(() => vi.unstubAllEnvs())

describe('Supabase 同源代理配置', () => {
  it('生产默认同源代理，并保留真实项目与原 SDK 会话键', async () => {
    const config = await import('../../src/lib/config')
    expect(config.configError).toBeNull()
    expect(config.supabaseApiUrl).toBe(`${window.location.origin}/supabase`)
    expect(config.supabaseUrl).toBe('https://project.supabase.co')
    expect(config.supabaseStorageKey).toBe('sb-project-auth-token')
  })

  it('开发默认直连原项目', async () => {
    vi.stubEnv('PROD', false)
    const config = await import('../../src/lib/config')
    expect(config.configError).toBeNull()
    expect(config.supabaseApiUrl).toBe('https://project.supabase.co')
  })

  it.each([
    { prod: true, proxy: 'false', expected: 'https://project.supabase.co' },
    { prod: false, proxy: 'true', expected: `${window.location.origin}/supabase` },
  ])('显式 $proxy 覆盖生产默认值 $prod', async ({ prod, proxy, expected }) => {
    vi.stubEnv('PROD', prod)
    vi.stubEnv('VITE_SUPABASE_PROXY', proxy)
    const config = await import('../../src/lib/config')
    expect(config.configError).toBeNull()
    expect(config.supabaseApiUrl).toBe(expected)
    expect(config.supabaseStorageKey).toBe('sb-project-auth-token')
  })

  it.each(['', 'TRUE', '1', 'https://attacker.example'])('拒绝无效代理开关 %j', async value => {
    vi.stubEnv('VITE_SUPABASE_PROXY', value)
    const config = await import('../../src/lib/config')
    expect(config.configError).toContain('VITE_SUPABASE_PROXY')
    const { supabase } = await import('../../src/lib/supabase')
    expect(supabase).toBeNull()
  })

  it.each([
    'https://auth.water555.com/supabase',
    'https://user:password@project.supabase.co',
    'https://project.supabase.co?target=other',
    'https://project.supabase.co#fragment',
    'http://project.supabase.co',
    'not-a-url',
  ])('拒绝作为原项目地址的无效配置 %j', async value => {
    vi.stubEnv('VITE_SUPABASE_URL', value)
    const { configError } = await import('../../src/lib/config')
    expect(configError).not.toBeNull()
  })

  it('生产启用代理仍拒绝服务端私钥', async () => {
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_secret_private')
    const { configError } = await import('../../src/lib/config')
    expect(configError).not.toBeNull()
  })
})
