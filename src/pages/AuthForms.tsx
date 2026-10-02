import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthCard, Field, Notice } from '../components/Form'
import { getSupabase } from '../lib/supabase'
import { callbackUrl } from '../lib/config'
import { authPath, safeNext } from '../lib/navigation'
import { errorMessage } from '../lib/errors'

export function Login() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [unconfirmed, setUnconfirmed] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('')
    try {
      const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password })
      if (error) { setUnconfirmed(error.code === 'email_not_confirmed'); throw error }
      navigate(next, { replace: true })
    } catch (error) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }
  async function resend() {
    setBusy(true); setError(''); setSuccess('')
    try {
      const { error } = await getSupabase().auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: callbackUrl(next) } })
      if (error) throw error
      setSuccess('验证邮件已请求发送，请检查收件箱和垃圾邮件。')
    } catch (error) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }
  return <AuthCard title="登录" intro="欢迎回到吾水阁，让每一滴水找到归处。">
    <Notice kind="error">{error}</Notice><Notice kind="success">{success}</Notice>
    <form onSubmit={submit} className="stack"><fieldset disabled={busy} className="stack">
      <Field label="邮箱" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} />
      <Field label="密码" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
      <div className="form-right"><Link to={authPath('/forgot-password', next)}>忘记密码？</Link></div>
      <button className="button" type="submit">{busy ? '正在处理…' : '登录'}</button>
      {unconfirmed && <button type="button" className="button secondary" onClick={resend}>重新发送验证邮件</button>}
    </fieldset></form>
    <p className="form-footer">还没有账号？ <Link to={authPath('/register', next)}>注册账号</Link></p>
  </AuthCard>
}

export function Register() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const displayName = name.trim()
      if (!displayName) throw new Error('请输入昵称。')
      const { data, error } = await getSupabase().auth.signUp({ email: email.trim(), password, options: {
        emailRedirectTo: callbackUrl(next), data: { display_name: displayName, name: displayName, full_name: displayName },
      } })
      if (error) throw error
      if (data.session) { navigate(next, { replace: true }); return }
      setSent(true); setPassword(''); setMessage('请查看邮箱中的验证邮件，完成验证后即可登录。如果已经注册，请直接登录或找回密码。')
    } catch (error) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }
  async function resend() {
    setBusy(true); setError('')
    try {
      const { error } = await getSupabase().auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: callbackUrl(next) } })
      if (error) throw error
      setMessage('验证邮件已请求重新发送，请检查收件箱和垃圾邮件。')
    } catch (error) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }
  return <AuthCard title="注册账号" intro="一滴入阁，百川成海。从这里开启你的水籍。">
    <Notice kind="error">{error}</Notice><Notice kind="success">{message}</Notice>
    {sent ? <div className="stack"><p>接收邮箱：<strong>{email}</strong></p><button className="button secondary" disabled={busy} onClick={resend}>重新发送验证邮件</button><button className="text-button" onClick={() => { setSent(false); setMessage('') }}>更换邮箱</button></div>
      : <form onSubmit={submit}><fieldset disabled={busy} className="stack">
        <Field label="昵称" autoComplete="nickname" required maxLength={64} value={name} onChange={event => setName(event.target.value)} hint="你的昵称会展示给你授权的应用。" />
        <Field label="邮箱" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} />
        <Field label="密码" type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} hint="至少 10 个字符，建议组合字母、数字和符号。" />
        <button className="button" type="submit">{busy ? '正在创建…' : '注册账号'}</button>
      </fieldset></form>}
    <p className="form-footer">已有账号？ <Link to={authPath('/login', next)}>登录</Link></p>
  </AuthCard>
}

export function ForgotPassword() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: callbackUrl(next) })
      if (error) throw error
      setMessage('如果该邮箱对应有效账号，你会收到恢复邮件。请检查收件箱和垃圾邮件；也可以在其他浏览器打开邮件链接。')
    } catch (error) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }
  return <AuthCard title="找回密码" intro="沿水溯源，通过邮箱找回你的账号。">
    <Notice kind="error">{error}</Notice><Notice kind="success">{message}</Notice>
    <form onSubmit={submit}><fieldset disabled={busy} className="stack">
      <Field label="邮箱" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} />
      <button className="button" type="submit">{busy ? '正在发送…' : message ? '重新发送恢复邮件' : '发送恢复邮件'}</button>
    </fieldset></form><p className="form-footer"><Link to={authPath('/login', next)}>返回登录</Link></p>
  </AuthCard>
}
