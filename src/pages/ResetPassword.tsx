import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AuthCard, Field, Notice } from '../components/Form'
import { useAuth } from '../lib/auth'
import { getSupabase } from '../lib/supabase'
import { isRecoverySession } from '../lib/recovery'
import { errorMessage } from '../lib/errors'
import { authPath, safeNext } from '../lib/navigation'

export default function ResetPassword() {
  const { session, recovery, finishRecovery } = useAuth()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [nonce, setNonce] = useState('')
  const [needsNonce, setNeedsNonce] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [done, setDone] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const { data: current, error: sessionError } = await getSupabase().auth.getSession()
      if (sessionError) throw sessionError
      if (!recovery || !isRecoverySession(session) || !isRecoverySession(current.session)) throw new Error('恢复会话已失效，请重新获取恢复邮件。')
      if (password !== confirmation) throw new Error('两次输入的密码不一致。')
      const { error } = await getSupabase().auth.updateUser({ password, ...(nonce ? { nonce: nonce.trim() } : {}) })
      if (error) {
        if (error.code === 'reauthentication_needed' || error.code === 'reauthentication_not_valid') setNeedsNonce(true)
        throw error
      }
      setDone(true); finishRecovery(); setPassword(''); setConfirmation(''); setNonce('')
    } catch (error) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }
  async function reauthenticate() {
    setBusy(true); setError('')
    try {
      const { error } = await getSupabase().auth.reauthenticate()
      if (error) throw error
      setMessage('验证码已发送，请查看邮箱。')
    } catch (error) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }
  if (done) return <AuthCard title="密码已重设" intro="新的密码已生效，请妥善保管。"><Link to={next} className="button">继续</Link></AuthCard>
  if (!session || !recovery || !isRecoverySession(session)) return <AuthCard title="重设密码" intro="请先打开恢复邮件中的验证链接。"><Notice>普通登录会话无法直接使用此页面，请通过恢复邮件继续。</Notice><Link className="button" to={authPath('/forgot-password', next)}>发送恢复邮件</Link></AuthCard>
  return <AuthCard title="重设密码" intro={`正在为 ${session.user.email || '当前账号'} 设置新密码。`}>
    <Notice kind="error">{error}</Notice><Notice kind="success">{message}</Notice>
    <form onSubmit={submit}><fieldset disabled={busy} className="stack">
      <Field label="新密码" type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} hint="至少 10 个字符，建议组合字母、数字和符号。" />
      <Field label="确认新密码" type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} />
      {needsNonce && <><Field label="邮箱验证码" autoComplete="one-time-code" required value={nonce} onChange={event => setNonce(event.target.value)} /><button className="button secondary" type="button" onClick={reauthenticate}>获取验证码</button></>}
      <button className="button" type="submit">{busy ? '正在保存…' : '保存新密码'}</button>
    </fieldset></form>
  </AuthCard>
}
