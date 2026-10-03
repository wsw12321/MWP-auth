export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
  SUPABASE_ORIGIN: string
}

const proxyPrefix = '/supabase'
const allowedMethods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
const requestHeaders = new Set([
  'accept', 'accept-language', 'apikey', 'authorization', 'content-type',
  'cache-control', 'x-client-info', 'x-supabase-api-version', 'x-upsert',
  'accept-profile', 'content-profile', 'prefer', 'range', 'range-unit',
  'if-match', 'if-none-match', 'if-modified-since', 'if-unmodified-since',
])
const hopByHopHeaders = [
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
]

function isApiPath(pathname: string): boolean {
  if (!/^\/(auth|rest|storage)\/v1(?:\/|$)/.test(pathname)) return false
  if (pathname.includes('//')) return false
  try {
    return pathname.split('/').every(segment => {
      const decoded = decodeURIComponent(segment)
      // Reject encoded separators, nested encodings and traversal before an
      // upstream server can interpret them differently from the Worker.
      return decoded !== '.' && decoded !== '..'
        && !/[\\/%]/.test(decoded)
        && [...decoded].every(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    })
  } catch {
    return false
  }
}

function upstreamOrigin(value: string): URL | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname)
      || url.port || url.username || url.password || url.pathname !== '/'
      || url.search || url.hash) return null
    return url
  } catch {
    return null
  }
}

function responseHeaders(original?: Headers): Headers {
  const headers = new Headers(original)
  for (const header of headers.get('connection')?.split(',') ?? []) {
    if (header.trim()) headers.delete(header.trim())
  }
  for (const header of hopByHopHeaders) headers.delete(header)
  for (const header of [...headers.keys()]) {
    if (header.startsWith('access-control-')) headers.delete(header)
  }
  // The SDK stores its own session. Upstream cookies must never become cookies
  // for the account site's domain, and personal responses must not be cached.
  headers.delete('set-cookie')
  headers.delete('set-cookie2')
  headers.delete('age')
  headers.set('Cache-Control', 'private, no-store, max-age=0')
  headers.set('CDN-Cache-Control', 'no-store')
  headers.set('Cloudflare-CDN-Cache-Control', 'no-store')
  headers.set('Surrogate-Control', 'no-store')
  headers.set('Pragma', 'no-cache')
  headers.set('Expires', '0')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  return headers
}

function errorResponse(status: number, code: string, message: string, extra?: Record<string, string>): Response {
  const headers = responseHeaders()
  headers.set('Content-Type', 'application/json; charset=utf-8')
  for (const [name, value] of Object.entries(extra ?? {})) headers.set(name, value)
  return new Response(JSON.stringify({ code, message }), { status, headers })
}

function rewriteLocation(location: string, upstream: URL, publicOrigin: string): string {
  try {
    const target = new URL(location, upstream)
    if (target.origin === upstream.origin && !target.username && !target.password && isApiPath(target.pathname)) {
      return `${publicOrigin}${proxyPrefix}${target.pathname}${target.search}${target.hash}`
    }
  } catch {
    // Preserve an unrecognized Location without following it on the server.
  }
  return location
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const incoming = new URL(request.url)
    if (incoming.pathname !== proxyPrefix && !incoming.pathname.startsWith(`${proxyPrefix}/`)) {
      return env.ASSETS.fetch(request)
    }

    const path = incoming.pathname.slice(proxyPrefix.length)
    if (!isApiPath(path)) return errorResponse(404, 'not_found', 'Unknown API endpoint.')
    if (!allowedMethods.includes(request.method)) {
      return errorResponse(405, 'method_not_allowed', 'Unsupported request method.', { Allow: allowedMethods.join(', ') })
    }
    const origin = upstreamOrigin(env.SUPABASE_ORIGIN)
    if (!origin) return errorResponse(503, 'proxy_misconfigured', 'The API service is not configured.')

    const upstream = new URL(path + incoming.search, origin)
    const headers = new Headers()
    for (const [name, value] of request.headers) {
      if (requestHeaders.has(name)) headers.set(name, value)
    }
    // No browser cookies, Origin/Referer, Host, Forwarded or claimed client IP
    // headers cross this boundary. The browser still supplies its own apikey/JWT;
    // this proxy never adds a service role or other elevated credentials.
    const controller = new AbortController()
    const abort = () => controller.abort()
    request.signal.addEventListener('abort', abort, { once: true })
    if (request.signal.aborted) abort()
    const timeout = setTimeout(abort, 15_000)
    try {
      // duplex is needed by Node's Web API implementation for the streamed-body
      // tests and is ignored by Workers. Bodies (including avatars) stay binary.
      const init: RequestInit & { duplex?: 'half' } = {
        method: request.method,
        headers,
        body: request.body,
        ...(request.body ? { duplex: 'half' } : {}),
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal,
      }
      // One attempt only: never replay registrations, uploads or other writes.
      const result = await fetch(upstream, init)
      const outgoingHeaders = responseHeaders(result.headers)
      const location = outgoingHeaders.get('Location')
      if (location) outgoingHeaders.set('Location', rewriteLocation(location, upstream, incoming.origin))
      return new Response(result.body, {
        status: result.status,
        statusText: result.statusText,
        headers: outgoingHeaders,
      })
    } catch {
      // Never expose exception text, full URLs, passwords, tokens or query strings.
      return errorResponse(502, 'upstream_unavailable', 'The API service is temporarily unavailable. Please try again.')
    } finally {
      clearTimeout(timeout)
      request.signal.removeEventListener('abort', abort)
    }
  },
}
