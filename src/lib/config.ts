import { safeNext } from './navigation'

const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const rawKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
const rawSite = import.meta.env.VITE_SITE_URL?.trim()
const rawProxy = import.meta.env.VITE_SUPABASE_PROXY?.trim()

function validUrl(value: string | undefined, originOnly = false) {
  try {
    const url = new URL(value || '')
    return !url.username && !url.password && !url.search && !url.hash
      && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
      && (!originOnly || url.pathname === '/')
  } catch { return false }
}
function publicKey(value: string | undefined) {
  if (!value || value.includes('replace_me') || value.startsWith('sb_secret_')) return false
  if (value.startsWith('sb_publishable_')) return true
  try { return JSON.parse(atob(value.split('.')[1])).role === 'anon' } catch { return false }
}

export const configError = !validUrl(rawUrl, true) || !publicKey(rawKey) || !validUrl(rawSite, true)
  || (rawProxy !== undefined && rawProxy !== 'true' && rawProxy !== 'false')
  ? '请配置 VITE_SUPABASE_URL、VITE_SUPABASE_PUBLISHABLE_KEY 和 VITE_SITE_URL 后重新构建。仅可使用公开的 publishable key（或旧版 anon key）；VITE_SUPABASE_URL 应为原项目地址，VITE_SUPABASE_PROXY 如有设置只能为 true 或 false。'
  : null
export const siteUrl = rawSite?.replace(/\/$/, '') || window.location.origin
export const supabaseUrl = rawUrl?.replace(/\/$/, '') || ''
const useProxy = rawProxy === undefined ? import.meta.env.PROD : rawProxy === 'true'
// The proxy destination is always this page's origin, never an environment-supplied URL.
export const supabaseApiUrl = useProxy ? `${window.location.origin}/supabase` : supabaseUrl
export const supabaseStorageKey = validUrl(supabaseUrl, true)
  ? `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
  : ''
export const publishableKey = rawKey || ''
export function callbackUrl(next = '/account') {
  return `${siteUrl}/auth/callback?${new URLSearchParams({ next: safeNext(next) })}`
}
