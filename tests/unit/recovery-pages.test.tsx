import type { Session } from '@supabase/supabase-js'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Callback from '../../src/pages/Callback'
import ResetPassword from '../../src/pages/ResetPassword'
import { establishRecovery } from '../../src/lib/recovery'
import { makeSession, user } from '../fixtures'

const sdk = vi.hoisted(() => ({
  verifyEmailLink: vi.fn(), getSession: vi.fn(), updateUser: vi.fn(),
  establishRecovery: vi.fn(), finishRecovery: vi.fn(),
  contextSession: null as Session | null,
}))
vi.mock('../../src/lib/email', () => ({ verifyEmailLink: sdk.verifyEmailLink }))
vi.mock('../../src/lib/supabase', () => ({ getSupabase: () => ({ auth: sdk }) }))
vi.mock('../../src/lib/config', () => ({ siteUrl: 'http://localhost:3000' }))
vi.mock('../../src/lib/auth', () => ({ useAuth: () => ({
  session: sdk.contextSession, recovery: true,
  establishRecovery: sdk.establishRecovery, finishRecovery: sdk.finishRecovery,
}) }))

function renderCallback() {
  return render(<MemoryRouter initialEntries={['/auth/callback?token_hash=old-recovery-token&type=recovery']}>
    <Routes>
      <Route path="/auth/callback" element={<Callback />} />
      <Route path="/reset-password" element={<p>密码恢复表单已开放</p>} />
    </Routes>
  </MemoryRouter>)
}

beforeEach(() => {
  const session = makeSession()
  sdk.contextSession = session
  sdk.verifyEmailLink.mockReset().mockResolvedValue({ data: { user, session }, error: null })
  sdk.getSession.mockReset().mockResolvedValue({ data: { session }, error: null })
  sdk.updateUser.mockReset().mockResolvedValue({ data: { user }, error: null })
})

describe('恢复链接缓存与当前 SDK 会话的一致性', () => {
  it('旧验证结果遇到其他账号登录时不能开放重设密码', async () => {
    const otherAccount = { ...user, id: '22222222-2222-4222-8222-222222222222' }
    sdk.getSession.mockResolvedValue({ data: { session: makeSession(undefined, otherAccount) }, error: null })
    renderCallback()
    await expect(screen.findByRole('alert')).resolves.toHaveTextContent('当前登录会话已改变')
    expect(sdk.establishRecovery).not.toHaveBeenCalled()
    expect(screen.queryByText('密码恢复表单已开放')).not.toBeInTheDocument()
  })

  it('同一账号新的登录会话也不能复用旧恢复结果', async () => {
    sdk.getSession.mockResolvedValue({ data: { session: makeSession('new-login-session') }, error: null })
    renderCallback()
    await expect(screen.findByRole('alert')).resolves.toHaveTextContent('当前登录会话已改变')
    expect(sdk.establishRecovery).not.toHaveBeenCalled()
  })

  it('退出登录后不能用内存中的旧验证结果恢复会话', async () => {
    sdk.getSession.mockResolvedValue({ data: { session: null }, error: null })
    renderCallback()
    await expect(screen.findByRole('alert')).resolves.toHaveTextContent('当前登录会话已改变')
    expect(sdk.establishRecovery).not.toHaveBeenCalled()
  })

  it('同一会话令牌刷新后使用 SDK 当前会话继续恢复', async () => {
    const refreshed = makeSession(undefined, user, Math.floor(Date.now() / 1000) + 7200)
    sdk.getSession.mockResolvedValue({ data: { session: refreshed }, error: null })
    renderCallback()
    await expect(screen.findByText('密码恢复表单已开放')).resolves.toBeInTheDocument()
    expect(sdk.establishRecovery).toHaveBeenCalledWith(refreshed)
  })

  it('打开表单后SDK换成其他会话，提交时不会为错误账号更新密码', async () => {
    const original = makeSession()
    establishRecovery(original)
    sdk.contextSession = original
    sdk.getSession.mockResolvedValue({ data: { session: makeSession('other-session') }, error: null })
    render(<MemoryRouter initialEntries={['/reset-password']}><ResetPassword /></MemoryRouter>)
    await userEvent.type(screen.getByLabelText('新密码', { exact: true }), 'UpdatedPassword123!')
    await userEvent.type(screen.getByLabelText('确认新密码'), 'UpdatedPassword123!')
    await userEvent.click(screen.getByRole('button', { name: '保存新密码' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('恢复会话已失效'))
    expect(sdk.updateUser).not.toHaveBeenCalled()
    expect(sdk.finishRecovery).not.toHaveBeenCalled()
  })
})
