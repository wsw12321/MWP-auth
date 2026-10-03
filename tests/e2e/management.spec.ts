import { expect, test } from '@playwright/test'
import { mockSupabase } from './mock-supabase'

const avatar = {
  name: 'avatar.png', mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=', 'base64'),
}

test('旧 Supabase 头像通过同源地址显示且替换后能清理旧对象', async ({ page }) => {
  const { requests, session } = await mockSupabase(page, { signedIn: true, legacyAvatar: true })
  await page.goto('/account')
  await expect(page.getByAltText('当前头像')).toHaveAttribute('src', `http://127.0.0.1:4173/supabase/storage/v1/object/public/avatars/${session.user.id}/old.png`)
  await expect.poll(() => requests.some(request => request.path.endsWith('/old.png'))).toBe(true)
  await page.getByLabel('上传新头像', { exact: true }).setInputFiles(avatar)
  await expect(page.getByRole('status')).toContainText('头像已更新')
  expect(requests.find(request => request.path === '/storage/v1/object/avatars' && request.method === 'DELETE')?.body)
    .toEqual({ prefixes: [`${session.user.id}/old.png`] })
})

test('修改昵称通过Auth metadata保存并读回profiles确认', async ({ page }) => {
  const { requests } = await mockSupabase(page, { signedIn: true })
  await page.goto('/account')
  await expect(page.getByLabel('昵称', { exact: true })).toHaveValue('水友')
  await page.getByLabel('昵称', { exact: true }).fill('新昵称')
  await page.getByRole('button', { name: '保存昵称', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('昵称已保存')
  expect(requests.find(request => request.path === '/auth/v1/user' && request.method === 'PUT')?.body?.data).toEqual({ display_name: '新昵称', name: '新昵称', full_name: '新昵称' })
  expect(requests.some(request => request.path === '/rest/v1/profiles' && request.method !== 'GET')).toBe(false)
  await page.reload()
  await expect(page.getByLabel('昵称', { exact: true })).toHaveValue('新昵称')
})

for (const failure of ['profileSaveFailure', 'profileSyncMismatch'] as const) {
  test(`资料保存或同步失败不显示成功（${failure}）`, async ({ page }) => {
    await mockSupabase(page, { signedIn: true, [failure]: true })
    await page.goto('/account')
    await expect(page.getByLabel('昵称', { exact: true })).toHaveValue('水友')
    await page.getByLabel('昵称', { exact: true }).fill('未确认的新昵称')
    await page.getByRole('button', { name: '保存昵称', exact: true }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByText('昵称已保存。', { exact: true })).toHaveCount(0)
  })
}

test('头像可上传、替换、恢复默认，清理仅限当前用户旧文件', async ({ page }) => {
  const { requests, session } = await mockSupabase(page, { signedIn: true })
  await page.goto('/account')
  await page.getByLabel('上传新头像', { exact: true }).setInputFiles(avatar)
  await expect(page.getByRole('status')).toContainText('头像已更新')
  await page.getByLabel('上传新头像', { exact: true }).setInputFiles({ ...avatar, name: 'replacement.png' })
  await expect(page.getByRole('status')).toContainText('头像已更新')
  await page.getByRole('button', { name: '恢复默认头像', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('已恢复默认头像')
  await expect(page.getByLabel('默认头像', { exact: true })).toBeVisible()
  const uploads = requests.filter(request => request.path.startsWith('/storage/v1/object/avatars/') && request.method === 'POST')
  const deletions = requests.filter(request => request.path === '/storage/v1/object/avatars' && request.method === 'DELETE')
  expect(uploads).toHaveLength(2)
  expect(deletions).toHaveLength(2)
  for (const request of uploads) expect(request.path).toContain(`/avatars/${session.user.id}/`)
  for (const request of deletions) expect((request.body?.prefixes as string[]).every(path => path.startsWith(`${session.user.id}/`))).toBe(true)
})

test('头像格式、大小和内容不合法时阻止上传', async ({ page }) => {
  const { requests } = await mockSupabase(page, { signedIn: true })
  await page.goto('/account')
  const file = page.getByLabel('上传新头像', { exact: true })
  await file.setInputFiles({ name: 'script.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') })
  await expect(page.getByRole('alert')).toContainText('JPEG、PNG 或 WebP')
  await file.setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) })
  await expect(page.getByRole('alert')).toContainText('不能超过 2 MiB')
  await file.setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not a PNG') })
  await expect(page.getByRole('alert')).toContainText('内容与文件格式不符')
  expect(requests.some(request => request.path.startsWith('/storage/'))).toBe(false)
})

test('更换邮箱保留双确认状态并允许重发', async ({ page }) => {
  const { requests } = await mockSupabase(page, { signedIn: true })
  await page.goto('/account')
  await page.getByLabel('新邮箱', { exact: true }).fill('updated@example.com')
  await page.getByRole('button', { name: '发送修改确认邮件', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '确认邮件已发送' })).toContainText('原邮箱和新邮箱')
  await expect(page.getByRole('status').filter({ hasText: '正在修改为' })).toContainText('updated@example.com')
  await page.getByRole('button', { name: '重发邮箱确认邮件', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '已重新发送' })).toBeVisible()
  expect(requests.find(request => request.path === '/auth/v1/resend')?.body).toMatchObject({ type: 'email_change', email: 'water@example.com' })
})

test('账号密码更新携带当前密码，并可退出当前账号中心', async ({ page }) => {
  const { requests } = await mockSupabase(page, { signedIn: true })
  await page.goto('/account')
  await page.getByLabel('当前密码', { exact: true }).fill('CurrentPassword123!')
  await page.getByLabel('新密码', { exact: true }).fill('UpdatedPassword123!')
  await page.getByLabel('确认新密码', { exact: true }).fill('UpdatedPassword123!')
  await page.getByRole('button', { name: '更新密码', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('密码已更新')
  expect(requests.find(request => request.path === '/auth/v1/user' && request.method === 'PUT')?.body).toMatchObject({ password: 'UpdatedPassword123!', current_password: 'CurrentPassword123!' })
  await page.getByRole('button', { name: '退出当前登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '登录', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '登录', exact: true })).toBeVisible()
})

test('授权撤销要求确认，取消不撤销，确认后显示空列表', async ({ page }) => {
  const { requests } = await mockSupabase(page, { signedIn: true })
  await page.goto('/account/apps')
  await page.getByRole('button', { name: '撤销授权', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '撤销授权？' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  expect(requests.some(request => request.method === 'DELETE')).toBe(false)
  await page.getByRole('button', { name: '撤销授权', exact: true }).click()
  await dialog.getByRole('button', { name: '确认撤销', exact: true }).click()
  await expect(page.getByRole('heading', { name: '暂无已授权应用', exact: true })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: '已撤销对' })).toBeVisible()
  expect(requests.filter(request => request.path === '/auth/v1/user/oauth/grants' && request.method === 'DELETE')).toHaveLength(1)
})

test('授权撤销失败保留授权，重新加载后可再次操作', async ({ page }) => {
  await mockSupabase(page, { signedIn: true, revokeFailure: true })
  await page.goto('/account/apps')
  await page.getByRole('button', { name: '撤销授权', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '确认撤销', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('heading', { name: '暂无已授权应用', exact: true })).toHaveCount(0)
  await expect(page.getByText(/已撤销对/)).toHaveCount(0)
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.getByText('吾水阁测试应用', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '撤销授权', exact: true })).toBeEnabled()
})
