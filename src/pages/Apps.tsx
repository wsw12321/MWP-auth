import { useEffect, useRef, useState } from 'react'
import type { OAuthGrant } from '@supabase/supabase-js'
import { Link } from 'react-router-dom'
import { Loading, Notice } from '../components/Form'
import ReLogin from '../components/ReLogin'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/errors'
import { ensureCurrentUser, scopeLabels, sessionExpired } from '../lib/oauth'
import { getSupabase } from '../lib/supabase'
import { applicationUrl } from '../lib/sites'

export default function Apps() {
  const { user } = useAuth()
  const [grants, setGrants] = useState<OAuthGrant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [expired, setExpired] = useState(false)
  const [selected, setSelected] = useState<OAuthGrant | null>(null)
  const [busy, setBusy] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setExpired(false)
    getSupabase().auth.oauth.listGrants().then(({ data, error }) => {
      if (!active) return
      if (error) throw error
      setGrants(data || [])
    }).catch(error => {
      if (active) { setError(errorMessage(error)); setExpired(sessionExpired(error)) }
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [user?.id, retry])
  useEffect(() => {
    if (selected) dialog.current?.showModal()
    else dialog.current?.close()
  }, [selected])
  async function revoke() {
    if (!selected || !user || busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      await ensureCurrentUser(user.id)
      const { error } = await getSupabase().auth.oauth.revokeGrant({ clientId: selected.client.id })
      if (error) throw error
      setGrants(previous => previous.filter(grant => grant.client.id !== selected.client.id))
      setMessage(`已撤销对「${selected.client.name || '未命名应用'}」的授权。`)
      setSelected(null)
    } catch (error) {
      setSelected(null); setError(errorMessage(error)); setExpired(sessionExpired(error))
    } finally { setBusy(false) }
  }
  return <div className="stack">
    <div className="page-heading"><p className="eyebrow">连接由你掌握</p><h1>已授权应用</h1><p>点击应用，使用吾水阁账号登录；也可以随时收回访问许可。</p></div>
    <Notice>退出账号中心或撤销授权，不会自动清除各业务网站自己的本地会话。需要退出业务网站时，请前往对应网站操作。</Notice>
    <Notice kind="error">{error}</Notice><Notice kind="success">{message}</Notice>
    {expired && <ReLogin next="/account/apps" />}
    {loading ? <Loading>正在读取已授权应用…</Loading> : error ? <button className="button secondary" onClick={() => setRetry(value => value + 1)}>重新加载</button>
      : grants.length === 0 ? <section className="card empty-state"><h2>暂无已授权应用</h2><p>当你使用吾水阁账号连接应用后，会在这里看到它。</p><Link to="/sites">浏览接入网站 <span aria-hidden="true">↗</span></Link></section>
        : grants.map(grant => {
          const destination = applicationUrl(grant.client)
          const heading = <><span className="app-symbol" aria-hidden="true">{(grant.client.name || '应').slice(0, 1)}</span><div><h2>{grant.client.name || '未命名应用'}</h2><p className="muted">授权于 {new Date(grant.granted_at).toLocaleDateString('zh-CN')}</p></div></>
          return <section className="card app-grant stack" key={grant.client.id}>
            {destination ? <a className="app-entry" href={destination}>{heading}<span className="entry-arrow" aria-hidden="true">↗</span></a> : <div className="app-entry">{heading}</div>}
            <ul className="scope-list">{grant.scopes.map(scope => <li key={scope}>{scopeLabels[scope] || `其他范围：${scope}`}</li>)}</ul>
            <div className="row">{destination && <a className="button" href={destination}>进入应用 <span aria-hidden="true">↗</span></a>}<button className="button secondary" onClick={() => { setMessage(''); setSelected(grant) }}>撤销授权</button></div>
          </section>
        })}
    <dialog ref={dialog} onCancel={event => { if (busy) event.preventDefault(); else setSelected(null) }} aria-labelledby="revoke-title" aria-describedby="revoke-description">
      <h2 id="revoke-title">撤销授权？</h2><p id="revoke-description">确认撤销「{selected?.client.name}」的访问许可？该应用可能需要你重新授权，其现有本地登录会话不会自动退出。</p>
      <div className="row"><button className="button secondary" autoFocus disabled={busy} onClick={() => setSelected(null)}>取消</button><button className="button danger" disabled={busy} onClick={() => void revoke()}>{busy ? '正在撤销…' : '确认撤销'}</button></div>
    </dialog>
  </div>
}
