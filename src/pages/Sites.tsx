import { useAuth } from '../lib/auth'
import { Loading, Notice } from '../components/Form'
import { useConnectedSites } from '../lib/useConnectedSites'

export default function Sites() {
  const { user } = useAuth()
  const { sites, failed, retry } = useConnectedSites()
  return <div className="stack">
    <div className="page-heading"><p className="eyebrow">一滴水 · 万千连接</p><h1>接入网站</h1><p>发现已接入吾水阁账号中心的网站，前往你熟悉的水域。</p></div>
    {failed ? <>
      <Notice kind="error">网站目录暂时无法加载。</Notice>
      <button className="button secondary" onClick={retry}>重新加载</button>
    </> : sites === null ? <Loading>正在读取接入网站…</Loading>
      : sites.length === 0 && <section className="card empty-state"><h2>暂无接入网站</h2></section>}
    {sites?.map(site => {
      const destination = user ? site.loginUrl : site.url
      return <section className="card connected-site stack" key={site.clientId}>
        <a className="app-entry" href={destination}>
          <span className="app-symbol" aria-hidden="true">{site.name.slice(0, 1)}</span>
          <div><h2>{site.name}</h2><p className="muted">{new URL(site.url).hostname}</p></div>
          <span className="entry-arrow" aria-hidden="true">↗</span>
        </a>
        {site.description && <p className="muted">{site.description}</p>}
        <a className="button" href={destination}>访问网站 <span aria-hidden="true">↗</span></a>
      </section>
    })}
  </div>
}
