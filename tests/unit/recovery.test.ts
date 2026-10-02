import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearRecovery, establishRecovery, isRecoverySession } from '../../src/lib/recovery'
import { makeSession, user } from '../fixtures'

describe('密码恢复与已验证会话绑定', () => {
  beforeEach(() => sessionStorage.clear())

  it('普通登录会话没有密码恢复权限', () => {
    expect(isRecoverySession(makeSession())).toBe(false)
    expect(isRecoverySession(null)).toBe(false)
  })

  it('仅在成功验证恢复邮件后建立当前会话的恢复状态', () => {
    const session = makeSession()
    establishRecovery(session)
    expect(isRecoverySession(session)).toBe(true)
  })

  it('令牌刷新保持同一会话时仍允许重设密码', () => {
    establishRecovery(makeSession())
    const refreshed = makeSession(undefined, user, Math.floor(Date.now() / 1000) + 7200)
    expect(isRecoverySession(refreshed)).toBe(true)
  })

  it('同一用户重新登录产生的新会话不能继承恢复状态', () => {
    establishRecovery(makeSession())
    expect(isRecoverySession(makeSession('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'))).toBe(false)
  })

  it('其他用户不能继承恢复状态', () => {
    establishRecovery(makeSession())
    expect(isRecoverySession(makeSession(undefined, { ...user, id: '22222222-2222-4222-8222-222222222222' }))).toBe(false)
  })

  it('完成恢复或退出后清理恢复标识', () => {
    const session = makeSession()
    establishRecovery(session)
    clearRecovery()
    expect(isRecoverySession(session)).toBe(false)
  })

  it('恢复标识有时间限制，过期后必须重新验证邮件', () => {
    vi.useFakeTimers()
    try {
      const session = makeSession()
      establishRecovery(session)
      vi.advanceTimersByTime(61 * 60 * 1000)
      expect(isRecoverySession(session)).toBe(false)
    } finally { vi.useRealTimers() }
  })

  it('浏览器禁止读取存储时关闭恢复权限', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Storage blocked', 'SecurityError') })
    expect(isRecoverySession(makeSession())).toBe(false)
  })

  it('浏览器禁止写入存储时显示明确错误而不是放行', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Storage blocked', 'SecurityError') })
    expect(() => establishRecovery(makeSession())).toThrow('浏览器未允许会话存储')
  })

  it('浏览器禁止删除存储不会阻止退出登录', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('Storage blocked', 'SecurityError') })
    expect(() => clearRecovery()).not.toThrow()
  })

  it('无有效会话标识的令牌不能授予恢复状态', () => {
    const session = { ...makeSession(), access_token: 'not-a-jwt' }
    expect(() => establishRecovery(session)).toThrow()
    expect(isRecoverySession(session)).toBe(false)
  })
})
