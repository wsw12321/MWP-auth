import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/errors'
import { authPath } from '../lib/navigation'
import { Notice } from './Form'

export default function ReLogin({ next }: { next: string }) {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return <><Notice kind="error">{error}</Notice><Link to={authPath('/login', next)} aria-disabled={busy} onClick={async event => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    try { await signOut(); navigate(authPath('/login', next), { replace: true }) }
    catch (error) { setError(errorMessage(error)); setBusy(false) }
  }}>{busy ? '正在清理失效会话…' : '重新登录'}</Link></>
}
