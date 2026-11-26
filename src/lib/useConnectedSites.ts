import { useEffect, useState } from 'react'
import { parseConnectedSites, sitesPath, type ConnectedSite } from './sites'

export function useConnectedSites() {
  const [sites, setSites] = useState<ConnectedSite[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      const response = await fetch(sitesPath, { signal: controller.signal })
      if (!response.ok) throw new Error('Site directory unavailable.')
      const entries = parseConnectedSites(await response.json())
      if (!controller.signal.aborted) setSites(entries)
    }
    load().catch(() => {
      if (!controller.signal.aborted) {
        setSites([])
        setFailed(true)
      }
    })
    return () => controller.abort()
  }, [attempt])

  function retry() {
    setSites(null)
    setFailed(false)
    setAttempt(previous => previous + 1)
  }
  return { sites, failed, retry }
}
