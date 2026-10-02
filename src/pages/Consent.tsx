import { useEffect, useRef, useState } from 'react'
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js'
import { useSearchParams } from 'react-router-dom'
import { AuthCard, Loading, Notice } from '../components/Form'
import ReLogin from '../components/ReLogin'
import { useAuth } from '../lib/auth'
import { getSupabase } from '../lib/supabase'
import { errorMessage } from '../lib/errors'
import { ensureCurrentUser, redirectFromSupabase, scopeLabels, sessionExpired } from '../lib/oauth'

export default function Consent() {
  const { user, signOut } = useAuth()
  const [params] = useSearchParams()
  const authorizationId = params.get('authorization_id') || ''
  const valid = params.getAll('authorization_id').length === 1 && /^[a-zA-Z0-9_-]{1,200}$/.test(authorizationId)
  const next = `/oauth/consent?${new URLSearchParams({ authorization_id: authorizationId })}`
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(false)
  const [retry, setRetry] = useState(0)
  const requestVersion = useRef<symbol | null>(null)
  useEffect(() => {
    let active = true
    requestVersion.current = Symbol()
    setDetails(null); setLoading(true); setBusy(false); setError(''); setExpired(false)
    if (!valid) { setError('授权请求缺少有效的 authorization_id，请从应用重新发起登录。'); setLoading(false); return }
    getSupabase().auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error }) => {
      if (!active) return
      if (error) throw error
      if (!data) throw new Error('未能读取授权请求，请从应用重新发起登录。')
      if ('redirect_url' in data) { redirectFromSupabase(data.redirect_url); return }
      if (data.user.id !== user?.id || data.authorization_id !== authorizationId) throw new Error('授权请求与当前账号不一致，请从应用重新发起登录。')
      setDetails(data)
    }).catch(error => {
      if (active) { setError(errorMessage(error)); setExpired(sessionExpired(error)) }
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; requestVersion.current = null }
  }, [authorizationId, valid, user?.id, retry])
  async function decide(action: 'approve' | 'deny') {
    if (!user || !details || busy || !requestVersion.current) return
    const version = requestVersion.current
    setBusy(true); setError('')
    try {
      await ensureCurrentUser(user.id)
      if (requestVersion.current !== version) return
      const oauth = getSupabase().auth.oauth
      const result = action === 'approve'
        ? await oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : await oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })
      if (requestVersion.current !== version) return
      if (result.error) throw result.error
      if (!result.data?.redirect_url) throw new Error('授权服务未返回有效的跳转地址，请从应用重试。')
      redirectFromSupabase(result.data.redirect_url)
    } catch (error) {
      if (requestVersion.current === version) { setError(errorMessage(error)); setExpired(sessionExpired(error)); setBusy(false) }
    }
  }
  async function switchAccount() {
    setBusy(true); setError('')
    try { await signOut() } catch (error) { setError(errorMessage(error)); setBusy(false) }
  }
  return <AuthCard title="应用授权" intro="请确认你正在连接的应用，以及愿意分享的信息。">
    <Notice kind="error">{error}</Notice>
    {expired && <ReLogin next={next} />}
    {loading ? <Loading>正在读取授权请求…</Loading> : details ? <div className="stack">
      <div className="consent-client"><span className="app-symbol" aria-hidden="true">{(details.client.name || '应').slice(0, 1)}</span><h2>{details.client.name || '未命名应用'}</h2><p className="muted">希望连接你的吾水阁账号</p></div>
      <div className="consent-account"><small>当前账号</small><strong>{user?.email}</strong><button className="text-button" disabled={busy} onClick={switchAccount}>更换账号</button></div>
      <div><p className="scope-heading">该应用申请以下权限</p><ul className="scope-list">{details.scope.split(/\s+/).filter(Boolean).map(scope => <li key={scope}>{scopeLabels[scope] || `其他范围：${scope}`}</li>)}</ul></div>
      <p className="muted consent-note">你可以随时在「已授权应用」中撤销授权。</p>
      <div className="consent-actions"><button className="button secondary" disabled={busy || expired} onClick={() => void decide('deny')}>拒绝</button><button className="button" disabled={busy || expired} onClick={() => void decide('approve')}>{busy ? '正在处理…' : '同意授权'}</button></div>
    </div> : valid && !expired && <button className="button secondary" onClick={() => setRetry(value => value + 1)}>重新加载</button>}
  </AuthCard>
}
