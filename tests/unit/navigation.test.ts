import { describe, expect, it } from 'vitest'
import { callbackNext, safeNext } from '../../src/lib/navigation'

describe('账号流程续接', () => {
  it.each(['/account', '/account/apps', '/sites', '/oauth/consent?authorization_id=auth_123'])('保留允许的站内地址 %s', (destination) => {
    expect(safeNext(destination)).toBe(destination)
  })

  it.each([
    null, '', 'https://evil.example/account', '//evil.example/account',
    '\\\\evil.example\\account', '/\\evil.example/account',
    'javascript:alert(1)', '/%2f%2fevil.example', '/account/../../evil',
    '/login', '/reset-password', '/auth/callback?token_hash=secret',
    '/oauth/consent', '/unknown', '/oauth/consent?authorization_id=a&authorization_id=b',
    '/oauth/consent?authorization_id=%2F%2Fevil.example', '/account#https://evil.example',
  ])('拒绝非允许续接地址 %s', (destination) => {
    expect(safeNext(destination)).toBe('/account')
  })

  it('不把额外重定向或凭据传给下个页面', () => {
    const target = safeNext('/oauth/consent?authorization_id=auth_123&next=https://evil.example&token_hash=secret')
    expect(target).toBe('/oauth/consent?authorization_id=auth_123')
  })
})


describe('邮件回调中的继续目标', () => {
  const site = 'https://account.water.example'
  it('从允许的本站邮件回调提取授权请求', () => {
    const params = new URLSearchParams({ redirect_to: `${site}/auth/callback?next=${encodeURIComponent('/oauth/consent?authorization_id=auth_123')}` })
    expect(callbackNext(params, site)).toBe('/oauth/consent?authorization_id=auth_123')
  })
  it.each(['https://evil.example/auth/callback?next=/account/apps', 'https://account.water.example.evil.example/auth/callback?next=/account/apps', `${site}/unknown?next=/account/apps`])('拒绝外站或未知邮件回调 %s', (redirect) => {
    expect(callbackNext(new URLSearchParams({ redirect_to: redirect }), site)).toBe('/account')
  })
  it('显式next同样受到路径允许列表约束', () => {
    expect(callbackNext(new URLSearchParams({ next: 'https://evil.example' }), site)).toBe('/account')
  })
})
