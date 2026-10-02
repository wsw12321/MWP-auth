import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthCard, Loading, Notice } from '../components/Form'
import { useAuth } from '../lib/auth'
import { siteUrl } from '../lib/config'
import { verifyEmailLink } from '../lib/email'
import type { MailType } from '../lib/email'
import { errorMessage } from '../lib/errors'
import { getSupabase } from '../lib/supabase'
import { sameAuthSession } from '../lib/recovery'
import { authPath, callbackNext } from '../lib/navigation'

export default function Callback() {
  const location = useLocation()
  // Capture before removing credentials, and retain across effect replay.
  const [params] = useState(() => new URLSearchParams(location.search))
  const next = callbackNext(params, siteUrl)
  const type = params.get('type')
  const { establishRecovery } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState<'loading' | 'success' | 'partial' | 'error'>('loading')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    // Remove tokens even on invalid links, while keeping React Router's history key.
    window.history.replaceState(window.history.state, '', `/auth/callback?${new URLSearchParams({ next })}`)
    const tokenHash = params.get('token_hash')
    if (!tokenHash || !['signup', 'recovery', 'email_change'].includes(type || '') || params.getAll('token_hash').length !== 1 || params.getAll('type').length !== 1) {
      setError('验证链接不完整或已失效，请重新获取邮件。'); setState('error')
      return
    }
    verifyEmailLink(tokenHash, type as MailType).then(async ({ data, error }) => {
      if (!active) return
      if (error) throw error
      if (type === 'recovery') {
        if (!data.session) throw new Error('恢复链接未建立有效会话，请重新获取恢复邮件。')
        const { data: current, error: sessionError } = await getSupabase().auth.getSession()
        if (!active) return
        if (sessionError) throw sessionError
        if (!current.session || !sameAuthSession(data.session, current.session)) {
          throw new Error('当前登录会话已改变，请重新获取恢复邮件。')
        }
        establishRecovery(current.session)
        navigate(authPath('/reset-password', next), { replace: true })
      } else if (type === 'email_change' && !data.session) {
        setState('partial')
      } else { setState('success') }
    }).catch(error => {
      if (active) { setError(errorMessage(error)); setState('error') }
    })
    return () => { active = false }
  }, [params, type, next, establishRecovery, navigate])
  return <AuthCard title="邮箱验证" intro="连接每一滴水，也守护每一份信任。">
    {state === 'loading' && <Loading>正在验证邮件链接…</Loading>}
    {state === 'success' && <div className="stack"><Notice kind="success">{type === 'email_change' ? '邮箱修改已确认。' : '邮箱验证成功，欢迎加入吾水阁。'}</Notice><Link className="button" to={next}>继续</Link></div>}
    {state === 'partial' && <div className="stack"><Notice>此邮箱已确认，仍待另一邮箱确认。请打开另一封邮件中的链接，新旧邮箱均确认后修改才会生效。</Notice><Link className="button secondary" to="/account">查看账号设置</Link></div>}
    {state === 'error' && <div className="stack"><Notice kind="error">{error}</Notice>
      {type === 'recovery' ? <Link className="button" to={authPath('/forgot-password', next)}>重新发送恢复邮件</Link>
        : type === 'email_change' ? <><p className="muted">登录账号设置后，可重新发送邮箱修改确认邮件。</p><Link className="button" to="/account">前往账号设置</Link></>
        : <><p className="muted">输入邮箱和密码登录后，可为未验证的账号重新发送验证邮件。</p><Link className="button" to={authPath('/login', next)}>登录并重新发送验证邮件</Link></>}
    </div>}
  </AuthCard>
}
