import { expect, test } from '@playwright/test'
import { mockSupabase } from './mock-supabase'

const codexClient = {
  id: 'b883cebe-d570-4e7b-96dc-0423b15f9a89', name: 'Codex Gateway',
  uri: 'https://codex.water555.com', logo_uri: '',
}

test('接入网站公开展示 Codex，刷新可访问且点击前往网站', async ({ page }, testInfo) => {
  const { requests } = await mockSupabase(page)
  await page.route('https://codex.water555.com/**', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><h1>Codex 网关</h1>',
  }))
  await page.goto('/login')
  await page.getByRole('link', { name: '接入网站', exact: true }).click()
  await expect(page).toHaveURL(/\/sites$/)
  await page.reload()
  await expect(page.getByRole('heading', { name: '接入网站', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Codex 网关', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /Codex 网关.*codex.water555.com/ })).toHaveAttribute('href', 'https://codex.water555.com')
  await expect(page.getByRole('link', { name: '访问网站', exact: true })).toHaveAttribute('href', 'https://codex.water555.com')
  expect(requests.some(request => request.path.includes('/oauth/grants'))).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/sites-${testInfo.project.name}.png`, fullPage: true })
  await page.getByRole('link', { name: '访问网站', exact: true }).click()
  await expect(page).toHaveURL('https://codex.water555.com/')
})

test('已登录时接入网站的两个入口都发起统一登录，不查询授权列表', async ({ page }) => {
  const { requests } = await mockSupabase(page, { signedIn: true })
  await page.route('https://codex.water555.com/**', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><h1>网关收到统一登录请求</h1>',
  }))
  const siteEntry = page.getByRole('link', { name: /Codex 网关.*codex.water555.com/ })
  const visitButton = page.getByRole('link', { name: '访问网站', exact: true })
  for (const entry of [siteEntry, visitButton]) {
    await page.goto('/sites')
    await expect(siteEntry).toHaveAttribute('href', 'https://codex.water555.com/?login=water5')
    await expect(visitButton).toHaveAttribute('href', 'https://codex.water555.com/?login=water5')
    await entry.click()
    await expect(page).toHaveURL('https://codex.water555.com/?login=water5')
  }
  expect(requests.some(request => request.path.includes('/oauth/grants'))).toBe(false)
})

test('在接入网站页退出后两个入口立即恢复首页，刷新及再次访问仍有效', async ({ page }) => {
  const { requests } = await mockSupabase(page, { signedIn: true })
  const siteEntry = page.getByRole('link', { name: /Codex 网关.*codex.water555.com/ })
  const visitButton = page.getByRole('link', { name: '访问网站', exact: true })
  await page.goto('/sites')
  await expect(siteEntry).toHaveAttribute('href', 'https://codex.water555.com/?login=water5')
  await expect(visitButton).toHaveAttribute('href', 'https://codex.water555.com/?login=water5')
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await expect(page).toHaveURL(/\/sites$/)
  await expect(siteEntry).toHaveAttribute('href', 'https://codex.water555.com')
  await expect(visitButton).toHaveAttribute('href', 'https://codex.water555.com')
  await expect(page.getByRole('button', { name: '退出登录', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(siteEntry).toHaveAttribute('href', 'https://codex.water555.com')
  await expect(visitButton).toHaveAttribute('href', 'https://codex.water555.com')
  await page.goto('/login')
  await page.getByRole('link', { name: '接入网站', exact: true }).click()
  await expect(page).toHaveURL(/\/sites$/)
  await expect(siteEntry).toHaveAttribute('href', 'https://codex.water555.com')
  await expect(visitButton).toHaveAttribute('href', 'https://codex.water555.com')
  expect(requests.some(request => request.path === '/auth/v1/logout')).toBe(true)
  expect(requests.some(request => request.path.includes('/oauth/grants'))).toBe(false)
})

test('已授权的 Codex 应用提供网关自动登录入口，撤销与网站目录互不影响', async ({ page }, testInfo) => {
  const { requests } = await mockSupabase(page, { signedIn: true, grantClient: codexClient })
  await page.route('https://codex.water555.com/**', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><h1>网关收到统一登录请求</h1>',
  }))
  await page.goto('/account/apps')
  await expect(page.getByRole('link', { name: /Codex Gateway.*授权于/ })).toHaveAttribute('href', 'https://codex.water555.com/?login=water5')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/apps-${testInfo.project.name}.png`, fullPage: true })
  await page.setViewportSize({ width: 320, height: 760 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('link', { name: /Codex Gateway.*授权于/ }).click()
  await expect(page).toHaveURL('https://codex.water555.com/?login=water5')
  await page.goto('/account/apps')
  await expect(page.getByRole('link', { name: '进入应用', exact: true })).toHaveAttribute('href', 'https://codex.water555.com/?login=water5')
  await page.getByRole('button', { name: '撤销授权', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '确认撤销', exact: true }).click()
  await expect(page.getByRole('heading', { name: '暂无已授权应用', exact: true })).toBeVisible()
  const grantRequests = requests.filter(request => request.path.includes('/oauth/grants')).length
  await page.getByRole('link', { name: '浏览接入网站', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Codex 网关', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /Codex 网关.*codex.water555.com/ })).toHaveAttribute('href', 'https://codex.water555.com/?login=water5')
  await expect(page.getByRole('link', { name: '访问网站', exact: true })).toHaveAttribute('href', 'https://codex.water555.com/?login=water5')
  expect(requests.filter(request => request.path.includes('/oauth/grants'))).toHaveLength(grantRequests)
  await page.getByRole('link', { name: '访问网站', exact: true }).click()
  await expect(page).toHaveURL('https://codex.water555.com/?login=water5')
})
