import { expect, test } from '@playwright/test'
import { mockSupabase } from './mock-supabase'

test('手机和桌面登录页无水平溢出，键盘可完成登录', async ({ page }, testInfo) => {
  const { requests } = await mockSupabase(page)
  await page.goto('/login')
  const email = page.getByLabel('邮箱', { exact: true })
  await expect(email).toBeVisible()
  await page.screenshot({ path: `test-results/login-${testInfo.project.name}.png`, fullPage: true, animations: 'disabled' })
  await email.focus()
  await page.keyboard.type('water@example.com')
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('密码', { exact: true })).toBeFocused()
  await page.keyboard.type('SafePassword123!')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/account$/)
  await expect(page.getByRole('heading', { name: '账号设置', exact: true })).toBeVisible()
  expect(requests.some(request => request.path === '/auth/v1/token')).toBe(true)
  expect(requests.every(request => request.url.startsWith('http://127.0.0.1:4173/supabase/'))).toBe(true)
  expect(await page.evaluate(() => Boolean(localStorage.getItem('sb-test-project-auth-token')))).toBe(true)
  expect(await page.evaluate(() => localStorage.getItem('sb-127-auth-token'))).toBeNull()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('旧会话过期后通过同源接口刷新并恢复账号', async ({ page }) => {
  const { requests } = await mockSupabase(page, { signedIn: true, expiredStoredSession: true })
  await page.goto('/account')
  await expect(page.getByRole('heading', { name: '账号设置', exact: true })).toBeVisible()
  expect(requests.some(request => request.path === '/auth/v1/token'
    && new URL(request.url).searchParams.get('grant_type') === 'refresh_token'
    && request.body?.refresh_token === 'test-refresh-token')).toBe(true)
})

test('登录保留待处理授权请求，同意后仅跳向 Supabase 返回的地址', async ({ page }) => {
  const { requests } = await mockSupabase(page)
  await page.goto('/oauth/consent?authorization_id=auth_123')
  await expect(page).toHaveURL(/\/login\?next=/)
  await page.getByLabel('邮箱', { exact: true }).fill('water@example.com')
  await page.getByLabel('密码', { exact: true }).fill('SafePassword123!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByText('吾水阁测试应用', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /同意/ }).click()
  await expect(page).toHaveURL('https://client.example/callback?code=approved&state=state123')
  expect(requests.filter(r => r.path.endsWith('/consent') && r.method === 'POST').map(r => r.body?.action)).toEqual(['approve'])
})

test('恶意 next 不会离开账号中心', async ({ page }) => {
  await mockSupabase(page)
  await page.goto('/login?next=https%3A%2F%2Fevil.example')
  await page.getByLabel('邮箱', { exact: true }).fill('water@example.com')
  await page.getByLabel('密码', { exact: true }).fill('SafePassword123!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/127\.0\.0\.1:4173\/account$/)
})

test('深层路由直接打开和刷新后恢复当前会话', async ({ page }) => {
  await mockSupabase(page, { signedIn: true })
  await page.goto('/account/apps')
  await expect(page.getByText('吾水阁测试应用', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page).toHaveURL(/\/account\/apps$/)
  await expect(page.getByText('吾水阁测试应用', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('拒绝授权返回 SDK 提供的拒绝地址', async ({ page }) => {
  const { requests } = await mockSupabase(page, { signedIn: true })
  await page.goto('/oauth/consent?authorization_id=auth_123')
  await page.getByRole('button', { name: /拒绝/ }).click()
  await expect(page).toHaveURL('https://client.example/callback?error=access_denied&state=state123')
  expect(requests.find(r => r.path.endsWith('/consent'))?.body).toEqual({ action: 'deny' })
})

test('已有授权自动处理 Supabase 返回的直接跳转', async ({ page }) => {
  await mockSupabase(page, { signedIn: true, alreadyAuthorized: true })
  await page.goto('/oauth/consent?authorization_id=auth_123')
  await expect(page).toHaveURL('https://client.example/callback?code=existing&state=state123')
})

test('会话失效时授权页显示重新登录入口', async ({ page }) => {
  await mockSupabase(page, { signedIn: true, expiredSession: true })
  await page.goto('/oauth/consent?authorization_id=auth_123')
  await expect(page.getByRole('alert')).toContainText(/失效|重新登录/)
  await page.getByRole('link', { name: '重新登录', exact: true }).click()
  await expect(page).toHaveURL(/\/login\?next=/)
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
})

test('恢复邮件验证去重，删除地址栏凭据并保留密码重设流程', async ({ page }) => {
  const { requests } = await mockSupabase(page)
  await page.goto('/auth/callback?token_hash=recovery-secret&type=recovery')
  await expect(page).toHaveURL(/\/reset-password(?:\?|$)/)
  await expect(page.getByRole('heading', { name: /重设密码|重置密码|设置新密码/ })).toBeVisible()
  expect(page.url()).not.toContain('recovery-secret')
  expect(requests.filter(r => r.path === '/auth/v1/verify')).toHaveLength(1)
  await page.reload()
  await expect(page.getByRole('heading', { name: /重设密码|重置密码|设置新密码/ })).toBeVisible()
})

test('普通登录会话不能直接打开密码恢复表单', async ({ page }) => {
  await mockSupabase(page, { signedIn: true })
  await page.goto('/reset-password')
  await expect(page.getByRole('button', { name: /保存新密码|重设密码|重置密码/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /恢复|找回|邮件/ })).toBeVisible()
})

test('更换邮箱第一次确认展示仍待另一邮箱确认', async ({ page }) => {
  const { requests } = await mockSupabase(page, { partialEmailChange: true })
  await page.goto('/auth/callback?token_hash=first-confirmation&type=email_change')
  await expect(page.getByRole('status')).toContainText(/另一|两个|新旧/)
  expect(page.url()).not.toContain('first-confirmation')
  expect(requests.filter(r => r.path === '/auth/v1/verify')).toHaveLength(1)
})

test('无效恢复邮件提供重发入口且不开放密码更新', async ({ page }) => {
  await mockSupabase(page, { invalidEmailLink: true })
  await page.goto('/auth/callback?token_hash=expired-secret&type=recovery')
  await expect(page.getByRole('alert')).toContainText(/过期|无效/)
  await expect(page.getByRole('link', { name: /重新|恢复|找回/ })).toBeVisible()
  expect(page.url()).not.toContain('expired-secret')
})

test('注册同步昵称展示字段并允许重新发送验证邮件', async ({ page }) => {
  const { requests } = await mockSupabase(page)
  await page.goto('/register?next=%2Foauth%2Fconsent%3Fauthorization_id%3Dauth_123')
  await page.getByLabel('昵称', { exact: true }).fill('新水友')
  await page.getByLabel('邮箱', { exact: true }).fill('new@example.com')
  await page.getByLabel('密码', { exact: true }).fill('SafePassword123!')
  await page.getByRole('button', { name: '注册账号', exact: true }).click()
  await expect(page.getByRole('status')).toContainText(/验证邮件/)
  const signup = requests.find(request => request.path === '/auth/v1/signup')
  expect(signup?.body?.data).toEqual({ display_name: '新水友', name: '新水友', full_name: '新水友' })
  await page.getByRole('button', { name: '重新发送验证邮件', exact: true }).click()
  await expect(page.getByRole('status')).toContainText(/重新发送/)
  expect(requests.find(request => request.path === '/auth/v1/resend')?.body).toMatchObject({ type: 'signup', email: 'new@example.com' })
})

test('找回密码发送恢复邮件，并可重复请求', async ({ page }) => {
  const { requests } = await mockSupabase(page)
  await page.goto('/forgot-password')
  await page.getByLabel('邮箱', { exact: true }).fill('water@example.com')
  await page.getByRole('button', { name: '发送恢复邮件', exact: true }).click()
  await expect(page.getByRole('status')).toContainText(/收到恢复邮件/)
  await page.getByRole('button', { name: '重新发送恢复邮件', exact: true }).click()
  await expect(page.getByRole('button', { name: '重新发送恢复邮件', exact: true })).toBeEnabled()
  expect(requests.filter(request => request.path === '/auth/v1/recover')).toHaveLength(2)
})

test('注册确认可在新浏览器会话打开并继续原授权', async ({ page }) => {
  const { requests } = await mockSupabase(page)
  await page.goto('/auth/callback?token_hash=signup-secret&type=signup&next=%2Foauth%2Fconsent%3Fauthorization_id%3Dauth_123')
  await expect(page.getByRole('status')).toContainText('邮箱验证成功')
  expect(page.url()).not.toContain('signup-secret')
  await page.getByRole('link', { name: '继续', exact: true }).click()
  await expect(page.getByText('吾水阁测试应用', { exact: true })).toBeVisible()
  expect(requests.filter(request => request.path === '/auth/v1/verify')).toHaveLength(1)
})

test('完成密码恢复后不能再次使用恢复表单', async ({ page }) => {
  const { requests } = await mockSupabase(page)
  await page.goto('/auth/callback?token_hash=recovery-secret&type=recovery')
  await page.getByLabel('新密码', { exact: true }).fill('UpdatedPassword123!')
  await page.getByLabel('确认新密码', { exact: true }).fill('UpdatedPassword123!')
  await page.getByRole('button', { name: '保存新密码', exact: true }).click()
  await expect(page.getByRole('heading', { name: '密码已重设', exact: true })).toBeVisible()
  expect(requests.find(request => request.path === '/auth/v1/user' && request.method === 'PUT')?.body).toMatchObject({ password: 'UpdatedPassword123!' })
  await page.reload()
  await expect(page.getByRole('link', { name: '发送恢复邮件', exact: true })).toBeVisible()
  await expect(page.getByLabel('新密码', { exact: true })).toHaveCount(0)
})

test('未验证账号登录失败时提供验证邮件重发', async ({ page }) => {
  const { requests } = await mockSupabase(page, { unconfirmedLogin: true })
  await page.goto('/login')
  await page.getByLabel('邮箱', { exact: true }).fill('new@example.com')
  await page.getByLabel('密码', { exact: true }).fill('SafePassword123!')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('验证邮箱')
  await page.getByRole('button', { name: '重新发送验证邮件', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('验证邮件')
  expect(requests.find(request => request.path === '/auth/v1/resend')?.body).toMatchObject({ type: 'signup', email: 'new@example.com' })
})

test('Supabase 要求密码重验证时支持获取和提交验证码', async ({ page }) => {
  const { requests } = await mockSupabase(page, { requireReauthentication: true })
  await page.goto('/auth/callback?token_hash=recovery-secret&type=recovery')
  await page.getByLabel('新密码', { exact: true }).fill('UpdatedPassword123!')
  await page.getByLabel('确认新密码', { exact: true }).fill('UpdatedPassword123!')
  await page.getByRole('button', { name: '保存新密码', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('验证码')
  await page.getByRole('button', { name: '获取验证码', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('验证码已发送')
  await page.getByLabel('邮箱验证码', { exact: true }).fill('123456')
  await page.getByRole('button', { name: '保存新密码', exact: true }).click()
  await expect(page.getByRole('heading', { name: '密码已重设', exact: true })).toBeVisible()
  const updates = requests.filter(request => request.path === '/auth/v1/user' && request.method === 'PUT')
  expect(updates.at(-1)?.body).toMatchObject({ password: 'UpdatedPassword123!', nonce: '123456' })
  expect(requests.some(request => request.path === '/auth/v1/reauthenticate')).toBe(true)
})


test('更换邮箱完成双确认后显示成功并可进入账号设置', async ({ page }) => {
  await mockSupabase(page)
  await page.goto('/auth/callback?token_hash=second-confirmation&type=email_change')
  await expect(page.getByRole('status')).toContainText('邮箱修改已确认')
  expect(page.url()).not.toContain('second-confirmation')
  await page.getByRole('link', { name: '继续', exact: true }).click()
  await expect(page.getByRole('heading', { name: '账号设置', exact: true })).toBeVisible()
})

test('成功响应但无恢复会话时不能设置新密码', async ({ page }) => {
  await mockSupabase(page, { partialEmailChange: true })
  await page.goto('/auth/callback?token_hash=no-session&type=recovery')
  await expect(page.getByRole('alert')).toContainText('恢复链接未建立有效会话')
  await expect(page.getByLabel('新密码', { exact: true })).toHaveCount(0)
})

test('不支持的邮件类型不会兑换token且会清理地址栏', async ({ page }) => {
  const { requests } = await mockSupabase(page)
  await page.goto('/auth/callback?token_hash=unsupported-secret&type=magiclink')
  await expect(page.getByRole('alert')).toContainText(/不完整|失效/)
  expect(page.url()).not.toContain('unsupported-secret')
  expect(requests.filter(request => request.path === '/auth/v1/verify')).toHaveLength(0)
})
