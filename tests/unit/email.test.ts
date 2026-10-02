import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSession, user } from '../fixtures'

const sdk = vi.hoisted(() => ({ verifyOtp: vi.fn() }))
vi.mock('../../src/lib/supabase', () => ({ getSupabase: () => ({ auth: sdk }) }))

beforeEach(() => {
  vi.resetModules()
  sdk.verifyOtp.mockReset()
})

describe('邮件 token_hash 验证', () => {
  it('无效链接返回失败，不伪造成功会话', async () => {
    const { verifyEmailLink } = await import('../../src/lib/email')
    const expired = { data: { user: null, session: null }, error: { code: 'otp_expired', message: 'Token expired' } }
    sdk.verifyOtp.mockResolvedValue(expired)
    expect(await verifyEmailLink('expired-token', 'recovery')).toEqual(expired)
  })

  it('同一链接的并发和重复挂载只兑换一次 token_hash', async () => {
    const { verifyEmailLink } = await import('../../src/lib/email')
    sdk.verifyOtp.mockResolvedValue({ data: { user, session: makeSession() }, error: null })
    await Promise.all([
      verifyEmailLink('one-use-token', 'signup'),
      verifyEmailLink('one-use-token', 'signup'),
    ])
    await verifyEmailLink('one-use-token', 'signup')
    expect(sdk.verifyOtp).toHaveBeenCalledTimes(1)
    expect(sdk.verifyOtp).toHaveBeenCalledWith({ token_hash: 'one-use-token', type: 'signup' })
  })

  it('不同邮件各自验证，不错误复用上一封的结果', async () => {
    const { verifyEmailLink } = await import('../../src/lib/email')
    sdk.verifyOtp.mockResolvedValue({ data: { user, session: makeSession() }, error: null })
    await verifyEmailLink('first-token', 'email_change')
    await verifyEmailLink('second-token', 'email_change')
    expect(sdk.verifyOtp).toHaveBeenCalledTimes(2)
  })

  it('保留更换邮箱首封确认的无会话结果', async () => {
    const { verifyEmailLink } = await import('../../src/lib/email')
    const intermediate = { data: { user: null, session: null }, error: null }
    sdk.verifyOtp.mockResolvedValue(intermediate)
    expect(await verifyEmailLink('email-change-first', 'email_change')).toEqual(intermediate)
  })
})
