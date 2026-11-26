export const sitesPath = '/api/sites'

export interface ConnectedSite {
  clientId: string
  name: string
  description: string
  url: string
  loginUrl: string
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}

export function parseConnectedSites(value: unknown): ConnectedSite[] {
  if (!Array.isArray(value)) throw new Error('Expected a site list.')
  const ids = new Set<string>()
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid site.')
    const { clientId, name, description = '', url, loginUrl = url } = entry as Record<string, unknown>
    const homepage = httpsUrl(url)
    const login = httpsUrl(loginUrl)
    if (typeof clientId !== 'string' || !clientId.trim() || ids.has(clientId.trim())
      || typeof name !== 'string' || !name.trim() || typeof description !== 'string' || !homepage || !login) {
      throw new Error('Invalid site.')
    }
    ids.add(clientId.trim())
    return { clientId: clientId.trim(), name: name.trim(), description, url: homepage, loginUrl: login }
  })
}

/** Registered applications use their own login entry to establish a local session. */
export function applicationUrl(client: { id: string; uri?: string }, sites: ConnectedSite[]) {
  return sites.find(site => site.clientId === client.id)?.loginUrl ?? httpsUrl(client.uri)
}
