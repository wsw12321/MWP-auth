import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { Link } from 'react-router-dom'
import { Field, Loading, Notice } from '../components/Form'
import ReLogin from '../components/ReLogin'
import { useAuth } from '../lib/auth'
import { callbackUrl } from '../lib/config'
import { errorMessage } from '../lib/errors'
import { readProfile, requireCurrentUser, safeAvatarUrl, saveAvatar, saveNickname } from '../lib/profile'
import type { Profile } from '../lib/profile'
import { getSupabase } from '../lib/supabase'
import { sessionExpired } from '../lib/oauth'

type Section = 'profile' | 'avatar' | 'email' | 'password' | 'session'
type Feedback = { section: Section; text: string; failed: boolean } | null

export default function Account() {
  const { user, signOut } = useAuth()
  const userId = user?.id
  const [accountUser, setAccountUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [nonce, setNonce] = useState('')
  const [needsNonce, setNeedsNonce] = useState(false)
  const [busy, setBusy] = useState<Section | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [expired, setExpired] = useState(false)
  const [avatarFailed, setAvatarFailed] = useState(false)

  useEffect(() => {
    if (!userId) return
    let active = true
    setProfile(null); setLoadError(''); setFeedback(null); setExpired(false)
    requireCurrentUser(userId).then(freshUser => { if (active) { setAccountUser(freshUser); setPendingEmail(freshUser.new_email || '') }; return readProfile(userId) }).then(value => { if (active) { setProfile(value); setNickname(value.display_name) } }).catch(error => { if (active) { setLoadError(errorMessage(error)); setExpired(sessionExpired(error)) } })
    return () => { active = false }
  }, [userId, reload])
  useEffect(() => { if (user) { setAccountUser(user); setPendingEmail(user.new_email || '') } }, [user])
  useEffect(() => { setAvatarFailed(false) }, [profile?.avatar_url])

  async function run(section: Section, action: () => Promise<string>) {
    if (busy || !userId) return
    setBusy(section); setFeedback(null)
    try { const text = await action(); setFeedback({ section, text, failed: false }) }
    catch (error) {
      if (sessionExpired(error)) setExpired(true)
      setFeedback({ section, text: errorMessage(error), failed: true })
    } finally { setBusy(null) }
  }
  const notice = (section: Section) => feedback?.section === section ? <Notice kind={feedback.failed ? 'error' : 'success'}>{feedback.text}</Notice> : null
  const disabled = busy !== null || expired

  async function nicknameSubmit(event: FormEvent) {
    event.preventDefault()
    await run('profile', async () => {
      const updated = await saveNickname(userId!, nickname)
      setProfile(updated); setNickname(updated.display_name)
      return '昵称已保存。'
    })
  }
  async function changeAvatar(file: File | null) {
    await run('avatar', async () => {
      const result = await saveAvatar(userId!, file)
      setProfile(result.profile)
      return result.cleanupPending ? '头像已保存。旧图片暂未清理，请稍后联系管理员清理。' : file ? '头像已更新。' : '已恢复默认头像。'
    })
  }
  async function emailSubmit(event: FormEvent) {
    event.preventDefault()
    await run('email', async () => {
      const freshUser = await requireCurrentUser(userId!)
      const value = email.trim()
      if (!value || value.toLowerCase() === freshUser.email?.toLowerCase()) throw new Error('请输入与当前邮箱不同的新邮箱。')
      const { data, error } = await getSupabase().auth.updateUser({ email: value }, { emailRedirectTo: callbackUrl('/account') })
      if (error) throw error
      setAccountUser(data.user); setPendingEmail(data.user.new_email || (data.user.email?.toLowerCase() === value.toLowerCase() ? '' : value)); setEmail('')
      return '确认邮件已发送。请分别打开原邮箱和新邮箱中的链接；两边确认完成后，新邮箱才会生效。'
    })
  }
  async function resendEmail() {
    await run('email', async () => {
      const freshUser = await requireCurrentUser(userId!)
      setAccountUser(freshUser); setPendingEmail(freshUser.new_email || '')
      if (!freshUser.new_email) return '当前没有待确认的邮箱修改。'
      if (!freshUser.email) throw new Error('未能读取当前邮箱，请重新登录。')
      // Supabase locates the account by its current email, then sends to both addresses.
      const { error } = await getSupabase().auth.resend({ type: 'email_change', email: freshUser.email, options: { emailRedirectTo: callbackUrl('/account') } })
      if (error) throw error
      return '邮箱修改确认邮件已重新发送，请检查两个邮箱。'
    })
  }
  async function passwordSubmit(event: FormEvent) {
    event.preventDefault()
    await run('password', async () => {
      if (password !== confirmation) throw new Error('两次输入的密码不一致。')
      if (password.length < 10 || password.length > 128) throw new Error('密码长度须为 10 至 128 个字符。')
      await requireCurrentUser(userId!)
      const { error } = await getSupabase().auth.updateUser({ password, current_password: currentPassword, ...(nonce.trim() ? { nonce: nonce.trim() } : {}) })
      if (error) {
        if (['reauthentication_needed', 'reauthentication_not_valid'].includes(error.code || '')) setNeedsNonce(true)
        throw error
      }
      setCurrentPassword(''); setPassword(''); setConfirmation(''); setNonce(''); setNeedsNonce(false)
      return '密码已更新，请使用新密码登录。'
    })
  }
  async function reauthenticate() {
    await run('password', async () => {
      await requireCurrentUser(userId!)
      const { error } = await getSupabase().auth.reauthenticate()
      if (error) throw error
      setNeedsNonce(true)
      return '验证码已发送到当前邮箱，请填写后再次保存密码。'
    })
  }
  async function logout() { await run('session', async () => { await signOut(); return '已退出当前账号中心。' }) }

  if (!user) return null
  return <div className="account-page stack">
    <header className="page-heading"><p className="eyebrow">YOUR WATER5</p><h1>账号设置</h1><p className="muted">打理你的资料，让每一次相遇都有熟悉的名字。</p></header>
    {expired && <Notice kind="error">登录状态已失效，请重新登录。<ReLogin next="/account" /></Notice>}
    <section className="panel card stack" aria-labelledby="profile-title">
      <div><h2 id="profile-title">个人资料</h2><p className="muted">昵称和头像会展示在你授权的吾水阁应用中。</p></div>
      {loadError ? <><Notice kind="error">{loadError}</Notice><button type="button" className="button secondary" onClick={() => setReload(value => value + 1)}>重新加载资料</button></> : !profile ? <Loading>正在读取资料…</Loading> : <>
        <div className="row avatar-editor">
          <div className="avatar">{safeAvatarUrl(profile.avatar_url) && !avatarFailed ? <img src={safeAvatarUrl(profile.avatar_url)} alt="当前头像" referrerPolicy="no-referrer" onError={() => setAvatarFailed(true)} /> : <span aria-label="默认头像">{Array.from(profile.display_name || '水')[0]}</span>}</div>
          <div className="stack"><Field label="上传新头像" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void changeAvatar(file) }} hint="JPEG、PNG 或 WebP，最大 2 MiB。头像图片公开可见。" /><button type="button" className="button secondary" disabled={disabled || !profile.avatar_url} onClick={() => changeAvatar(null)}>恢复默认头像</button></div>
        </div>
        {busy === 'avatar' && <Loading>正在更新头像…</Loading>}{notice('avatar')}
        <form onSubmit={nicknameSubmit}><fieldset className="stack" disabled={disabled}>
          <Field label="昵称" required maxLength={64} autoComplete="nickname" value={nickname} onChange={event => setNickname(event.target.value)} hint="1 至 64 个字符，仅用于展示。" />
          <button className="button" type="submit">{busy === 'profile' ? '正在保存…' : '保存昵称'}</button>
        </fieldset></form>{notice('profile')}
      </>}
    </section>
    <section className="panel card stack" aria-labelledby="email-title">
      <div><h2 id="email-title">邮箱地址</h2><p>当前邮箱：<strong className="break-word">{accountUser?.email || user.email}</strong></p></div>
      {pendingEmail && <Notice>正在修改为 <strong className="break-word">{pendingEmail}</strong>。仍需完成新旧邮箱的确认；只确认一边时，修改不会生效。<button type="button" className="button secondary" disabled={disabled} onClick={resendEmail}>重发邮箱确认邮件</button></Notice>}
      <form onSubmit={emailSubmit}><fieldset className="stack" disabled={disabled}>
        <Field label="新邮箱" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} />
        <button className="button secondary" type="submit">{busy === 'email' ? '正在发送…' : '发送修改确认邮件'}</button>
      </fieldset></form>{notice('email')}
    </section>
    <section className="panel card stack" aria-labelledby="password-title">
      <div><h2 id="password-title">账号安全</h2><p className="muted">定期检查密码，守护属于你的水域。</p></div>
      <form onSubmit={passwordSubmit}><fieldset className="stack" disabled={disabled}>
        <Field label="当前密码" type="password" autoComplete="current-password" required maxLength={128} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} />
        <Field label="新密码" type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} hint="至少 10 个字符，建议组合字母、数字和符号。" />
        <Field label="确认新密码" type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} />
        {needsNonce && <><Field label="邮箱验证码" autoComplete="one-time-code" required value={nonce} onChange={event => setNonce(event.target.value)} /><button type="button" className="button secondary" onClick={reauthenticate}>获取验证码</button></>}
        <button className="button secondary" type="submit">{busy === 'password' ? '正在处理…' : '更新密码'}</button>
      </fieldset></form>{notice('password')}<Link to="/forgot-password?next=%2Faccount">忘记当前密码？通过邮件找回</Link>
    </section>
    <section className="panel card stack" aria-labelledby="apps-title"><div><h2 id="apps-title">应用与登录</h2><p className="muted">管理已授权应用，或结束当前账号中心的登录。</p></div><div className="row"><Link className="button secondary" to="/account/apps">管理已授权应用</Link><button type="button" className="button danger" disabled={busy !== null} onClick={logout}>{busy === 'session' ? '正在退出…' : '退出当前登录'}</button></div><p className="muted">中心退出、撤销授权不会自动清除各业务站自己的本地会话。需要完全退出时，请在对应业务站另行退出。</p>{notice('session')}</section>
  </div>
}
