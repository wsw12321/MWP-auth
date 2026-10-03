import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/errors'
import { Notice } from './Form'

function WaterMark() {
  return <svg viewBox="0 0 40 48" fill="none" aria-hidden="true"><path d="M20 3C15 12 4 22 4 30a16 16 0 0 0 32 0C36 22 25 12 20 3Z" fill="currentColor" /><path d="M12 30c0 5 3 8 8 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" /></svg>
}
export default function Layout({ children }: { children: ReactNode }) {
  const { user, signOut, error: authError } = useAuth()
  const location = useLocation()
  const isAccount = location.pathname.startsWith('/account') || location.pathname === '/sites'
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    document.getElementById('main-content')?.focus({ preventScroll: true })
    setError('')
  }, [location.pathname])
  async function logout() {
    setBusy(true); setError('')
    try { await signOut() } catch (error) { setError(errorMessage(error)) } finally { setBusy(false) }
  }
  return <div className="site-shell">
    <a className="skip-link" href="#main-content">跳到主要内容</a>
    <header className="site-header"><Link to="/" className="brand" aria-label="吾水阁账号中心首页"><span className="brand-icon"><WaterMark /></span><span><strong>吾水阁</strong><small>统一账号中心</small></span></Link>
      <div className="header-right"><NavLink to="/sites">接入网站</NavLink>{user ? <><NavLink to="/account">账号设置</NavLink><button className="text-button" disabled={busy} onClick={logout}>{busy ? '正在退出…' : '退出登录'}</button></> : <span className="header-note">吾水汇流，滴水成阁。</span>}</div>
    </header>
    <main id="main-content" tabIndex={-1} className={isAccount ? 'account-layout' : 'auth-layout'}>
      {(error || authError) && <div className="global-notice"><Notice kind="error">{error || authError}</Notice></div>}
      {isAccount ? <><aside className="account-sidebar"><p className="eyebrow">我的水籍</p><h1>账号中心</h1><p className="muted">在这里，管理你的每一次连接。</p><nav aria-label="账号导航"><NavLink to="/account" end>账号设置 <span aria-hidden="true">↗</span></NavLink><NavLink to="/account/apps">已授权应用 <span aria-hidden="true">↗</span></NavLink><NavLink to="/sites">接入网站 <span aria-hidden="true">↗</span></NavLink></nav><div className="sidebar-note"><span className="status-dot" />一个账号，汇流各处。</div></aside><div className="account-main">{children}</div></>
        : <><aside className="brand-story" aria-label="吾水阁介绍"><p className="eyebrow">一滴水 · 万千连接</p><h2>吾水汇流，<br />滴水成阁<span>。</span></h2><p>一个属于你的账号，<br />连接每一处熟悉的水域。</p><div className="water-scene" aria-hidden="true"><div className="water-orbit orbit-one" /><div className="water-orbit orbit-two" /><div className="water-orbit orbit-three" /><div className="water-drop"><WaterMark /></div><span className="water-point point-one" /><span className="water-point point-two" /></div><div className="story-caption"><span>01 / 身份的起点</span><span>WATER5</span></div></aside><div className="auth-content">{children}</div></>}
    </main>
    <footer className="site-footer"><span>© {new Date().getFullYear()} 吾水阁</span><span>账号安全 · 连接由你掌握</span></footer>
  </div>
}
