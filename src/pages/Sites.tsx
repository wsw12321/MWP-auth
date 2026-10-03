import { connectedSites } from '../lib/sites'

export default function Sites() {
  return <div className="stack">
    <div className="page-heading"><p className="eyebrow">一滴水 · 万千连接</p><h1>接入网站</h1><p>发现已接入吾水阁账号中心的网站，前往你熟悉的水域。</p></div>
    {connectedSites.map(site => <section className="card connected-site stack" key={site.clientId}>
      <a className="app-entry" href={site.url}>
        <span className="app-symbol" aria-hidden="true">{site.name.slice(0, 1)}</span>
        <div><h2>{site.name}</h2><p className="muted">{new URL(site.url).hostname}</p></div>
        <span className="entry-arrow" aria-hidden="true">↗</span>
      </a>
      <p className="muted">{site.description}</p>
      <a className="button" href={site.url}>访问网站 <span aria-hidden="true">↗</span></a>
    </section>)}
  </div>
}
