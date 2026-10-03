import { expect, test } from '@playwright/test'
import { mockSupabase } from './mock-supabase'

const codexClient = {
  id: '3e9c79d8-3c51-4fee-a986-7a2d5fed62dc', name: 'Codex Gateway',
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
  expect(requests.some(request => request.path.includes('/oauth/grants'))).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/sites-${testInfo.project.name}.png`, fullPage: true })
  await page.getByRole('link', { name: '访问网站', exact: true }).click()
  await expect(page).toHaveURL('https://codex.water555.com/')
})

test('已授权的 Codex 应用提供网关自动登录入口，撤销与网站目录互不影响', async ({ page }, testInfo) => {
  await mockSupabase(page, { signedIn: true, grantClient: codexClient })
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
  await page.getByRole('link', { name: '浏览接入网站', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Codex 网关', exact: true })).toBeVisible()
})
