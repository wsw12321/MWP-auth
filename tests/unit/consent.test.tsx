import type { User } from '@supabase/supabase-js'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Consent from '../../src/pages/Consent'
import { user } from '../fixtures'

const sdk = vi.hoisted(() => ({
  user: null as User | null,
  getAuthorizationDetails: vi.fn(), approveAuthorization: vi.fn(), denyAuthorization: vi.fn(),
  ensureCurrentUser: vi.fn(), redirectFromSupabase: vi.fn(), signOut: vi.fn(),
}))
vi.mock('../../src/lib/auth', () => ({ useAuth: () => ({ user: sdk.user, signOut: sdk.signOut }) }))
vi.mock('../../src/lib/supabase', () => ({ getSupabase: () => ({ auth: { oauth: sdk } }) }))
vi.mock('../../src/lib/oauth', () => ({
  ensureCurrentUser: sdk.ensureCurrentUser, redirectFromSupabase: sdk.redirectFromSupabase,
  scopeLabels: { openid: '识别账号', profile: '昵称和头像' }, sessionExpired: () => false,
}))

const details = {
  authorization_id: 'auth_123', redirect_uri: 'https://client.example/callback',
  client: { id: 'client-id', name: '测试应用', uri: '', logo_uri: '' },
  user: { id: user.id, email: user.email }, scope: 'openid profile',
}
const tree = () => <MemoryRouter initialEntries={['/oauth/consent?authorization_id=auth_123']}><Consent /></MemoryRouter>

beforeEach(() => {
  sdk.user = user
  sdk.getAuthorizationDetails.mockReset().mockResolvedValue({ data: details, error: null })
  sdk.ensureCurrentUser.mockReset().mockResolvedValue(undefined)
  sdk.approveAuthorization.mockReset()
  sdk.denyAuthorization.mockReset()
})

describe('授权决策的异步结果必须属于当前页面与账号', () => {
  for (const action of ['approve', 'deny'] as const) {
    it(`${action}请求返回前离开页面，不执行旧跳转`, async () => {
      let finish!: (value: { data: { redirect_url: string }; error: null }) => void
      const decide = action === 'approve' ? sdk.approveAuthorization : sdk.denyAuthorization
      decide.mockReturnValue(new Promise(resolve => { finish = resolve }))
      const view = render(tree())
      await screen.findByRole('heading', { name: '测试应用' })
      await userEvent.click(screen.getByRole('button', { name: action === 'approve' ? '同意授权' : '拒绝' }))
      await waitFor(() => expect(decide).toHaveBeenCalledOnce())
      view.unmount()
      await act(async () => finish({ data: { redirect_url: 'https://client.example/callback?code=stale' }, error: null }))
      expect(sdk.redirectFromSupabase).not.toHaveBeenCalled()
    })
  }

  it('等待同意期间切换账号，旧回包不能跳转且新账号仍可操作', async () => {
    let finish!: (value: { data: { redirect_url: string }; error: null }) => void
    sdk.approveAuthorization.mockReturnValue(new Promise(resolve => { finish = resolve }))
    const view = render(tree())
    await screen.findByRole('heading', { name: '测试应用' })
    await userEvent.click(screen.getByRole('button', { name: '同意授权' }))
    await waitFor(() => expect(sdk.approveAuthorization).toHaveBeenCalledOnce())
    const otherUser = { ...user, id: '22222222-2222-4222-8222-222222222222', email: 'other@example.com' }
    sdk.user = otherUser
    sdk.getAuthorizationDetails.mockResolvedValue({ data: { ...details, user: { id: otherUser.id, email: otherUser.email } }, error: null })
    view.rerender(tree())
    await screen.findByText('other@example.com')
    await act(async () => finish({ data: { redirect_url: 'https://client.example/callback?code=stale' }, error: null }))
    expect(sdk.redirectFromSupabase).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '同意授权' })).toBeEnabled()
  })
})
