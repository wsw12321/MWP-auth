import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../../src/lib/auth'
import { isRecoverySession } from '../../src/lib/recovery'
import { makeSession, user } from '../fixtures'

const sdk = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
  listener: null as ((event: AuthChangeEvent, session: Session | null) => void) | null,
}))
vi.mock('../../src/lib/supabase', () => ({
  supabase: { auth: sdk },
  getSupabase: () => ({ auth: sdk }),
}))

function Probe() {
  const auth = useAuth()
  return <>
    <output data-testid="state">{JSON.stringify({ loading: auth.loading, userId: auth.user?.id, recovery: auth.recovery, error: auth.error })}</output>
    <button onClick={() => void auth.signOut()}>退出</button>
    <button onClick={auth.finishRecovery}>完成恢复</button>
  </>
}
function state() {
  return JSON.parse(screen.getByTestId('state').textContent || '{}') as {
    loading: boolean; userId?: string; recovery: boolean; error: string | null
  }
}
function mount() { return render(<AuthProvider><Probe /></AuthProvider>) }
function emit(event: AuthChangeEvent, session: Session | null) {
  act(() => sdk.listener?.(event, session))
}

beforeEach(() => {
  sdk.getSession.mockReset().mockResolvedValue({ data: { session: makeSession() }, error: null })
  sdk.signOut.mockReset().mockResolvedValue({ error: null })
  sdk.onAuthStateChange.mockImplementation((listener) => {
    sdk.listener = listener
    return { data: { subscription: { unsubscribe: sdk.unsubscribe } } }
  })
})

describe('认证状态与 SDK 会话生命周期', () => {
  it('恢复会话并仅退出当前账号中心本地会话', async () => {
    mount()
    await waitFor(() => expect(state().userId).toBe(user.id))
    await userEvent.click(screen.getByRole('button', { name: '退出' }))
    await waitFor(() => expect(state().userId).toBeUndefined())
    expect(sdk.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(state().recovery).toBe(false)
  })

  it('正在初始化的旧会话不会覆盖后来验证成功的恢复会话', async () => {
    let resolveInitial!: (value: { data: { session: Session | null }; error: null }) => void
    sdk.getSession.mockReturnValue(new Promise((resolve) => { resolveInitial = resolve }))
    mount()
    const recoverySession = makeSession()
    emit('PASSWORD_RECOVERY', recoverySession)
    expect(state()).toMatchObject({ userId: user.id, recovery: true, loading: false })
    await act(async () => resolveInitial({ data: { session: null }, error: null }))
    expect(state()).toMatchObject({ userId: user.id, recovery: true, loading: false })
  })

  it('PASSWORD_RECOVERY 后的 SIGNED_IN 和 TOKEN_REFRESHED 不会抢先结束恢复流程', async () => {
    mount()
    await waitFor(() => expect(state().loading).toBe(false))
    const session = makeSession()
    emit('PASSWORD_RECOVERY', session)
    emit('SIGNED_IN', session)
    emit('TOKEN_REFRESHED', makeSession(undefined, user, Math.floor(Date.now() / 1000) + 7200))
    expect(state().recovery).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: '完成恢复' }))
    expect(state().recovery).toBe(false)
    expect(isRecoverySession(session)).toBe(false)
  })

  it('会话失效时同时清理登录和恢复状态', async () => {
    mount()
    await waitFor(() => expect(state().loading).toBe(false))
    const session = makeSession()
    emit('PASSWORD_RECOVERY', session)
    emit('SIGNED_OUT', null)
    expect(state()).toMatchObject({ loading: false, recovery: false })
    expect(state().userId).toBeUndefined()
    expect(isRecoverySession(session)).toBe(false)
  })

  it('初始化失败结束加载并显示错误', async () => {
    sdk.getSession.mockRejectedValue(new Error('network unavailable'))
    mount()
    await waitFor(() => expect(state().loading).toBe(false))
    expect(state().error).toBeTruthy()
    expect(state().userId).toBeUndefined()
  })

  it('卸载后取消认证状态订阅', () => {
    const view = mount()
    view.unmount()
    expect(sdk.unsubscribe).toHaveBeenCalledOnce()
  })
})
