import { parseConnectedSites } from '../src/lib/sites'

export function sitesResponse(method: string, binding: unknown): Response {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
  if (method !== 'GET' && method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } })
  }
  let response: Response
  try {
    const value = typeof binding === 'string' ? JSON.parse(binding) : binding
    response = Response.json(parseConnectedSites(value === undefined ? [] : value), { headers })
  } catch {
    response = Response.json({ code: 'sites_misconfigured' }, { status: 503, headers })
  }
  return method === 'HEAD' ? new Response(null, response) : response
}
