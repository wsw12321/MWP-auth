export const connectedSites = [{
  clientId: '3e9c79d8-3c51-4fee-a986-7a2d5fed62dc',
  name: 'Codex 网关',
  description: '统一管理模型访问、API Key 与使用记录。',
  url: 'https://codex.water555.com',
  loginUrl: 'https://codex.water555.com/?login=water5',
}] as const

/** Registered applications use their own login entry to establish a local session. */
export function applicationUrl(client: { id: string; uri?: string }) {
  const site = connectedSites.find(site => site.clientId === client.id)
  if (site) return site.loginUrl
  if (!client.uri) return null
  try {
    const url = new URL(client.uri)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}
