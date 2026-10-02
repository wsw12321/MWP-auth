import { isAuthSessionMissingError } from '@supabase/supabase-js'
import { getSupabase } from './supabase'

export const scopeLabels: Record<string, string> = {
  openid: '识别你的账号身份',
  email: '读取邮箱地址和验证状态',
  profile: '读取昵称和头像等展示资料',
  phone: '读取电话号码',
  offline_access: '在离线时保持授权访问',
}
export function redirectFromSupabase(redirectUrl: string) {
  const url = new URL(redirectUrl)
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('应用回调地址不受支持，请联系应用管理员检查 HTTPS 回调配置。')
  }
  window.location.assign(url.href)
}
export function sessionExpired(error: unknown) {
  if (isAuthSessionMissingError(error)) return true
  if (!error || typeof error !== 'object') return false
  return ('status' in error && [401, 403].includes(Number(error.status)))
    || ('code' in error && ['session_not_found', 'refresh_token_not_found', 'user_not_found', 'bad_jwt'].includes(String(error.code)))
}
export async function ensureCurrentUser(id: string) {
  const { data, error } = await getSupabase().auth.getUser()
  if (error) throw error
  if (!data.user || data.user.id !== id) throw new Error('当前账号已改变，请刷新页面后重试。')
}
