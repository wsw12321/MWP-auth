const base = 'https://account.invalid'

/** Only explicitly supported continuation routes survive. Never accept a URL. */
export function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')
    || [...value].some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) return '/account'
  try {
    const url = new URL(value, base)
    if (url.origin !== base || url.hash) return '/account'
    if (url.pathname === '/account' || url.pathname === '/account/apps') return url.pathname
    if (url.pathname === '/oauth/consent') {
      const ids = url.searchParams.getAll('authorization_id')
      if (ids.length === 1 && /^[a-zA-Z0-9_-]{1,200}$/.test(ids[0])) {
        return `/oauth/consent?${new URLSearchParams({ authorization_id: ids[0] })}`
      }
    }
  } catch { /* fall through to a known local page */ }
  return '/account'
}

export function authPath(path: '/login' | '/register' | '/forgot-password' | '/reset-password', next: string) {
  return `${path}?${new URLSearchParams({ next: safeNext(next) })}`
}

export function callbackNext(params: URLSearchParams, siteUrl: string) {
  if (params.has('next')) return safeNext(params.get('next'))
  try {
    const target = new URL(params.get('redirect_to') || '')
    if (target.origin === new URL(siteUrl).origin && target.pathname === '/auth/callback') {
      return safeNext(target.searchParams.get('next'))
    }
  } catch { /* email links without a continuation return to the account */ }
  return '/account'
}
